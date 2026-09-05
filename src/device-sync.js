import { vpsListUsers, vpsMe, vpsUpdatePreferences } from "./vps-api.js";

const APP_KEY = "shitu-kitchen-os-v1";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const PENDING_LANGUAGE_KEY = "shitu-kitchen-pending-language-v1";
const SYNC_INTERVAL = 60000;
const MIN_SYNC_GAP = 10000;
const ADMIN_ACCOUNTS_INTERVAL = 300000;

let running = false;
let lastSyncAt = 0;
let lastAdminAccountsAt = 0;
let preferenceWriteInFlight = null;
let preferenceWriteUserId = "";

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function appLanguage(profileLanguage) {
  return profileLanguage === "zh-TW" || profileLanguage === "zh" ? "zh" : "vi";
}

function apiLanguage(appLang) {
  return appLang === "zh" ? "zh-TW" : "vi";
}

function pendingLanguageFor(userId = "") {
  const pending = readJson(PENDING_LANGUAGE_KEY);
  if (!userId || pending?.userId !== userId) return "";
  return ["vi", "zh-TW"].includes(pending?.preferredLanguage) ? pending.preferredLanguage : "";
}

function setPendingLanguage(userId, preferredLanguage) {
  if (!userId || !["vi", "zh-TW"].includes(preferredLanguage)) return false;
  localStorage.setItem(PENDING_LANGUAGE_KEY, JSON.stringify({ userId, preferredLanguage }));
  return true;
}

function clearPendingLanguage(userId, preferredLanguage = "") {
  const pending = readJson(PENDING_LANGUAGE_KEY);
  if (!pending?.userId || pending.userId !== userId) return false;
  if (preferredLanguage && pending.preferredLanguage !== preferredLanguage) return false;
  localStorage.removeItem(PENDING_LANGUAGE_KEY);
  return true;
}

function applyLanguageToLocalState(profileLanguage) {
  const next = appLanguage(profileLanguage);
  const state = readJson(APP_KEY);
  if (!state?.settings || state.settings.language === next) return false;
  state.settings.language = next;
  localStorage.setItem(APP_KEY, JSON.stringify(state));
  return true;
}

function requestSafeReload(reason = "device-sync") {
  const event = new CustomEvent("shitu:safe-reload-requested", {
    cancelable: true,
    detail: { reason },
  });
  if (window.dispatchEvent(event)) location.reload();
}

function sessionSnapshot(user, preferredLanguageOverride = "") {
  const role = user.role || "employee";
  return {
    id: user.id,
    username: user.username,
    name: user.displayName || user.display_name || user.username,
    role: role === "admin" ? "admin" : role === "central" ? "central" : "branch",
    accountRole: role,
    location: role === "admin" ? "all" : (user.location || "fuxing"),
    permissions: user.permissions || {},
    preferredLanguage: preferredLanguageOverride || user.preferredLanguage || user.preferred_language || "vi",
    provider: "vps",
  };
}

async function syncAdminAccounts(profile, { force = false } = {}) {
  if (profile.accountRole !== "admin") return false;
  const now = Date.now();
  if (!force && lastAdminAccountsAt && now - lastAdminAccountsAt < ADMIN_ACCOUNTS_INTERVAL) return false;

  let result;
  try {
    result = await vpsListUsers();
  } catch {
    // Account-list availability must not block the already validated profile
    // from applying security or language changes. Leave the throttle untouched
    // so a later forced recovery can retry immediately.
    return false;
  }
  lastAdminAccountsAt = Date.now();
  const next = (result?.users || []).map((user) => ({
    id: user.id,
    username: user.username,
    password: "",
    name: user.display_name,
    role: user.role,
    location: user.location,
    active: user.active,
    permissions: user.permissions || {},
    preferredLanguage: user.preferred_language || "vi",
    provider: "vps",
  }));
  const previous = readJson(ACCOUNTS_KEY);
  if (sameJson(previous, next)) return false;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("shitu:accounts-synced"));
  return true;
}

async function drainPendingLanguage(user) {
  let currentUser = user;
  const userId = currentUser?.id;
  if (!userId) return { user: currentUser, preferredLanguage: "vi", confirmed: false };

  while (true) {
    const requestedLanguage = pendingLanguageFor(userId);
    const serverLanguage = currentUser?.preferredLanguage || currentUser?.preferred_language || "vi";
    if (!requestedLanguage) return { user: currentUser, preferredLanguage: serverLanguage, confirmed: true };
    if (serverLanguage === requestedLanguage) {
      clearPendingLanguage(userId, requestedLanguage);
      return { user: currentUser, preferredLanguage: requestedLanguage, confirmed: true };
    }

    try {
      const result = await vpsUpdatePreferences(requestedLanguage);
      if (result?.user?.id) currentUser = result.user;
      const latestLanguage = pendingLanguageFor(userId);
      if (latestLanguage && latestLanguage !== requestedLanguage) continue;
      clearPendingLanguage(userId, requestedLanguage);
      return { user: currentUser, preferredLanguage: requestedLanguage, confirmed: true };
    } catch {
      const latestLanguage = pendingLanguageFor(userId) || requestedLanguage;
      window.dispatchEvent(new CustomEvent("shitu:preferences-sync-pending", {
        detail: { preferredLanguage: latestLanguage },
      }));
      return { user: currentUser, preferredLanguage: latestLanguage, confirmed: false };
    }
  }
}

function retryPendingLanguage(user) {
  const userId = user?.id || "";
  if (preferenceWriteInFlight && preferenceWriteUserId === userId) {
    if (preferenceWriteInFlight) return preferenceWriteInFlight;
  }
  if (preferenceWriteInFlight) {
    const priorWrite = preferenceWriteInFlight;
    return priorWrite.catch(() => null).then(() => retryPendingLanguage(user));
  }
  preferenceWriteUserId = userId;
  preferenceWriteInFlight = drainPendingLanguage(user).finally(() => {
    preferenceWriteInFlight = null;
    preferenceWriteUserId = "";
  });
  return preferenceWriteInFlight;
}

async function syncNow({ force = false, forceAccounts = false } = {}) {
  if (document.documentElement.dataset.vpsAuthReady !== "true" || running) return;
  const now = Date.now();
  if (!force && lastSyncAt && now - lastSyncAt < MIN_SYNC_GAP) return;
  running = true;

  try {
    const result = await vpsMe();
    let user = result?.user;
    if (!user?.id || user.active === false) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent("shitu:auth-expired"));
      return;
    }
    // Only a validated profile response should start the normal sync throttle.
    // A transient network failure must remain immediately retryable on focus.
    lastSyncAt = Date.now();

    const expectedUserId = user.id;
    const preference = await retryPendingLanguage(user);
    user = preference.user;
    const activeSession = readJson(AUTH_KEY);
    if (user?.id !== expectedUserId || activeSession?.id !== expectedUserId) return;
    const previous = activeSession;
    const next = sessionSnapshot(user, preference.preferredLanguage);
    const securityChanged = Boolean(previous) && (
      previous.accountRole !== next.accountRole ||
      previous.location !== next.location ||
      previous.name !== next.name ||
      previous.username !== next.username ||
      !sameJson(previous.permissions || {}, next.permissions || {})
    );

    if (!sameJson(previous, next)) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    const languageChanged = applyLanguageToLocalState(next.preferredLanguage);
    await syncAdminAccounts(next, { force: forceAccounts });

    if (securityChanged) window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
    if (languageChanged) requestSafeReload("language-sync");
  } catch (error) {
    if ([401, 403].includes(Number(error?.status))) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent("shitu:auth-expired"));
    }
  } finally {
    running = false;
  }
}

async function persistLanguage(appLang) {
  const preferredLanguage = apiLanguage(appLang);
  const profile = readJson(AUTH_KEY);
  if (!profile?.id) return false;
  setPendingLanguage(profile.id, preferredLanguage);
  const preference = await retryPendingLanguage(profile);
  if (!preference.confirmed) return false;
  const activeProfile = readJson(AUTH_KEY);
  if (activeProfile?.id !== profile.id || (preference.user?.id && preference.user.id !== profile.id)) return false;
  const next = sessionSnapshot(preference.user || profile, preference.preferredLanguage);
  if (next.id) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
  return true;
}

document.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="set-language"][data-language]');
  if (!button) return;
  const lang = button.dataset.language === "zh" ? "zh" : "vi";
  setTimeout(() => { void persistLanguage(lang); }, 0);
}, true);

window.addEventListener("focus", () => { void syncNow(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncNow();
});
window.addEventListener("online", () => { void syncNow({ force: true }); });
window.setInterval(() => {
  if (document.visibilityState === "visible") void syncNow();
}, SYNC_INTERVAL);

window.addEventListener("shitu:vps-auth-ready", () => { void syncNow({ force: true }); });
if (document.documentElement.dataset.vpsAuthReady === "true") void syncNow({ force: true });
