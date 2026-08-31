import {
  getSupabase,
  getMyProfile,
  isSupabaseConfigured,
  mirrorSupabaseSessionToLegacy,
} from "./supabase-client.js";

const APP_KEY = "shitu-kitchen-os-v1";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const SYNC_INTERVAL = 20000;

let timer = 0;
let running = false;
let channel = null;
let currentUserId = "";

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function appLanguage(profileLanguage) {
  return profileLanguage === "zh-TW" || profileLanguage === "zh" ? "zh" : "vi";
}

function supabaseLanguage(appLang) {
  return appLang === "zh" ? "zh-TW" : "vi";
}

function applyLanguageToLocalState(profileLanguage) {
  const next = appLanguage(profileLanguage);
  const state = readJson(APP_KEY);
  if (!state?.settings || state.settings.language === next) return false;
  state.settings.language = next;
  localStorage.setItem(APP_KEY, JSON.stringify(state));
  return true;
}

function sessionSnapshot(profile) {
  return {
    id: profile.id,
    username: profile.username,
    name: profile.display_name,
    role: profile.role === "admin" ? "admin" : profile.role === "central" ? "central" : "branch",
    accountRole: profile.role,
    location: profile.location,
    permissions: profile.permissions || {},
    preferredLanguage: profile.preferred_language || "vi",
    provider: "supabase",
  };
}

async function syncAdminAccounts(supabase, profile) {
  if (profile.role !== "admin") return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,role,location,active,permissions,preferred_language")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return false;

  const next = data.map((p) => ({
    id: p.id,
    username: p.username,
    password: "",
    name: p.display_name,
    role: p.role,
    location: p.location,
    active: p.active,
    permissions: p.permissions || {},
    preferredLanguage: p.preferred_language || "vi",
    provider: "supabase",
  }));
  const previous = readJson(ACCOUNTS_KEY);
  if (sameJson(previous, next)) return false;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("shitu:accounts-synced"));
  return true;
}

async function ensureBroadcastChannel(supabase, userId) {
  if (!userId || currentUserId === userId && channel) return;
  if (channel) {
    try { await supabase.removeChannel(channel); } catch {}
  }
  currentUserId = userId;
  channel = supabase
    .channel(`kitchen-os-user-${userId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "preference" }, ({ payload }) => {
      const changed = applyLanguageToLocalState(payload?.preferred_language);
      if (changed) location.reload();
    })
    .subscribe();
}

async function syncNow({ reload = true } = {}) {
  if (!isSupabaseConfigured() || running) return;
  running = true;
  try {
    const supabase = await getSupabase();
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    let profile;
    try { profile = await getMyProfile(); } catch { return; }
    if (!profile?.id) return;

    await ensureBroadcastChannel(supabase, profile.id);

    const previousSession = readJson(AUTH_KEY);
    const nextSession = sessionSnapshot(profile);
    const securityChanged = previousSession && (
      previousSession.accountRole !== nextSession.accountRole ||
      previousSession.location !== nextSession.location ||
      previousSession.name !== nextSession.name ||
      previousSession.username !== nextSession.username ||
      !sameJson(previousSession.permissions || {}, nextSession.permissions || {})
    );

    if (!sameJson(previousSession, nextSession)) {
      await mirrorSupabaseSessionToLegacy(profile);
    }

    const languageChanged = applyLanguageToLocalState(profile.preferred_language);
    await syncAdminAccounts(supabase, profile);

    if (reload && (languageChanged || securityChanged)) {
      location.reload();
    }
  } finally {
    running = false;
  }
}

async function persistLanguage(appLang) {
  if (!isSupabaseConfigured()) return;
  const supabase = await getSupabase();
  if (!supabase) return;
  const preferred_language = supabaseLanguage(appLang);
  const { data, error } = await supabase.auth.updateUser({
    data: { preferred_language },
  });
  if (error) return;

  const userId = data?.user?.id;
  if (userId) {
    await ensureBroadcastChannel(supabase, userId);
    try {
      await channel?.send({
        type: "broadcast",
        event: "preference",
        payload: { preferred_language },
      });
    } catch {}
  }

  const session = readJson(AUTH_KEY);
  if (session) {
    session.preferredLanguage = preferred_language;
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  }
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
window.addEventListener("online", () => { void syncNow(); });

timer = window.setInterval(() => {
  if (document.visibilityState === "visible") void syncNow();
}, SYNC_INTERVAL);

void syncNow();
