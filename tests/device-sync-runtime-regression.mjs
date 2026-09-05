import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/device-sync.js"), "utf8");
const importLine = 'import { vpsListUsers, vpsMe, vpsUpdatePreferences } from "./vps-api.js";';
const injected = source.replace(importLine, `
const vpsListUsers = (...args) => globalThis.__testVpsListUsers(...args);
const vpsMe = (...args) => globalThis.__testVpsMe(...args);
const vpsUpdatePreferences = (...args) => globalThis.__testVpsUpdatePreferences(...args);
`);
assert.notEqual(injected, source, "device sync test could not inject VPS API mocks");

const APP_KEY = "shitu-kitchen-os-v1";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const PENDING_LANGUAGE_KEY = "shitu-kitchen-pending-language-v1";
const storage = new Map([
  [APP_KEY, JSON.stringify({ settings: { language: "vi" } })],
  [AUTH_KEY, JSON.stringify({
    id: "admin-1",
    username: "adminreg",
    name: "Admin Regression",
    role: "admin",
    accountRole: "admin",
    location: "all",
    permissions: { settings: { view: false, edit: false } },
    preferredLanguage: "vi",
    provider: "vps",
  })],
]);

globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
globalThis.CustomEvent = TestCustomEvent;

const windowListeners = new Map();
const documentListeners = new Map();
const nativeSetTimeout = globalThis.setTimeout;
globalThis.window = {
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(listener);
  },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) || []) listener(event);
    return true;
  },
  setInterval() { return 1; },
};
globalThis.document = {
  documentElement: { dataset: { vpsAuthReady: "false" } },
  visibilityState: "visible",
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(listener);
  },
};
let reloadCalls = 0;
globalThis.location = { reload() { reloadCalls += 1; } };

let meCalls = 0;
let accountCalls = 0;
let preferenceCalls = 0;
let failNextPreference = false;
let deferPreferenceWrites = false;
const deferredPreferenceWrites = [];
let serverPreferredLanguage = "zh-TW";
const profileUser = () => ({
  id: "admin-1",
  username: "adminreg",
  displayName: "Admin Regression",
  role: "admin",
  location: "all",
  permissions: { settings: { view: true, edit: true } },
  preferredLanguage: serverPreferredLanguage,
  active: true,
});
globalThis.__testVpsMe = async () => {
  meCalls += 1;
  if (meCalls === 1) throw new Error("TRANSIENT_PROFILE_SYNC_FAILURE");
  return { user: profileUser() };
};
globalThis.__testVpsListUsers = async () => {
  accountCalls += 1;
  if (accountCalls === 1) throw new Error("TRANSIENT_ACCOUNT_SYNC_FAILURE");
  return {
    users: [{
      id: "admin-1",
      username: "adminreg",
      display_name: "Admin Regression",
      role: "admin",
      location: "all",
      active: true,
      permissions: { settings: { view: true, edit: true } },
      preferred_language: serverPreferredLanguage,
    }],
  };
};
globalThis.__testVpsUpdatePreferences = async (preferredLanguage) => {
  preferenceCalls += 1;
  if (failNextPreference) {
    failNextPreference = false;
    throw new Error("TRANSIENT_PREFERENCE_SYNC_FAILURE");
  }
  if (deferPreferenceWrites) {
    return new Promise((resolve) => {
      deferredPreferenceWrites.push({
        preferredLanguage,
        resolve() {
          serverPreferredLanguage = preferredLanguage;
          resolve({ user: profileUser() });
        },
      });
    });
  }
  serverPreferredLanguage = preferredLanguage;
  return { user: profileUser() };
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
await import(moduleUrl);

let authSyncedEvents = 0;
let preferencePendingEvents = 0;
window.addEventListener("shitu:auth-synced", () => { authSyncedEvents += 1; });
window.addEventListener("shitu:preferences-sync-pending", () => { preferencePendingEvents += 1; });

const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));
function emitLanguageClick(language) {
  const button = { dataset: { action: "set-language", language } };
  const event = {
    target: {
      closest(selector) {
        return selector === '[data-action="set-language"][data-language]' ? button : null;
      },
    },
  };
  for (const listener of documentListeners.get("click") || []) listener(event);
}

document.documentElement.dataset.vpsAuthReady = "true";
window.dispatchEvent(new CustomEvent("shitu:vps-auth-ready"));
await delay(20);
assert.equal(meCalls, 1, "first profile sync attempt should reach the VPS");
assert.equal(accountCalls, 0, "account sync must not run when profile sync failed");

// A transient profile failure must not poison the normal 10-second focus throttle.
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(meCalls, 2, "focus should immediately retry a failed profile request");
assert.equal(accountCalls, 1, "successful profile retry should reach the admin account endpoint");
assert.equal(storage.has(ACCOUNTS_KEY), false, "failed admin account sync must not create a false local mirror");

// A secondary account-list outage must not suppress validated profile updates.
const profileAfterAccountFailure = JSON.parse(storage.get(AUTH_KEY) || "null");
assert.equal(profileAfterAccountFailure.permissions.settings.view, true, "profile permission update was blocked by account-list failure");
assert.equal(profileAfterAccountFailure.preferredLanguage, "zh-TW", "profile language update was blocked by account-list failure");
assert.equal(JSON.parse(storage.get(APP_KEY)).settings.language, "zh", "app language did not follow the validated profile");
assert.equal(authSyncedEvents, 1, "security-change event was suppressed by account-list failure");
assert.equal(reloadCalls, 1, "language reload was suppressed by account-list failure");

// Forced online recovery must retry the unthrottled admin account list.
window.dispatchEvent(new CustomEvent("online"));
await delay(20);
assert.equal(meCalls, 3, "online recovery should force another profile sync");
assert.equal(accountCalls, 2, "a failed admin account request must not poison the five-minute retry throttle");
const mirroredAccounts = JSON.parse(storage.get(ACCOUNTS_KEY) || "[]");
assert.equal(mirroredAccounts.length, 1, "successful retry did not update the admin account mirror");
assert.equal(mirroredAccounts[0].username, "adminreg");

// A failed language preference write must remain pending and must not be
// overwritten by the stale server preference on the next profile refresh.
storage.set(APP_KEY, JSON.stringify({ settings: { language: "vi" } }));
failNextPreference = true;
emitLanguageClick("vi");
await delay(20);
assert.equal(preferenceCalls, 1, "language click did not attempt to persist the preference");
assert.equal(serverPreferredLanguage, "zh-TW", "failed preference write unexpectedly changed the server state");
assert.equal(JSON.parse(storage.get(APP_KEY)).settings.language, "vi", "failed preference write reverted the local language immediately");
assert.equal(preferencePendingEvents, 1, "failed preference write did not expose pending sync state");
const durablePending = JSON.parse(storage.get(PENDING_LANGUAGE_KEY) || "null");
assert.equal(durablePending?.userId, "admin-1", "pending language was not bound to the current user");
assert.equal(durablePending?.preferredLanguage, "vi", "pending language was not persisted for reload recovery");
const reloadsBeforePreferenceRecovery = reloadCalls;

window.dispatchEvent(new CustomEvent("online"));
await delay(20);
assert.equal(meCalls, 4, "online recovery did not refresh the profile before retrying preference sync");
assert.equal(preferenceCalls, 2, "pending language preference was not retried after connectivity recovery");
assert.equal(serverPreferredLanguage, "vi", "preference retry did not update the server language");
assert.equal(JSON.parse(storage.get(APP_KEY)).settings.language, "vi", "stale server language overwrote the pending local preference");
assert.equal(JSON.parse(storage.get(AUTH_KEY)).preferredLanguage, "vi", "mirrored session did not adopt the confirmed preference");
assert.equal(storage.has(PENDING_LANGUAGE_KEY), false, "confirmed language preference left a stale pending cache behind");
assert.equal(reloadCalls, reloadsBeforePreferenceRecovery, "preference recovery caused an unnecessary language rollback reload");

// A pending preference owned by another account must never be applied.
storage.set(PENDING_LANGUAGE_KEY, JSON.stringify({ userId: "other-user", preferredLanguage: "zh-TW" }));
serverPreferredLanguage = "vi";
window.dispatchEvent(new CustomEvent("online"));
await delay(20);
assert.equal(preferenceCalls, 2, "foreign-account pending language leaked into the current session");
assert.equal(JSON.parse(storage.get(AUTH_KEY)).preferredLanguage, "vi", "foreign-account pending language changed the current profile mirror");
storage.delete(PENDING_LANGUAGE_KEY);

// Rapid language changes must serialize writes. The second intent must not be
// sent until the first response settles, and the server must end on the latest
// requested language rather than whichever response happens to finish last.
deferPreferenceWrites = true;
emitLanguageClick("vi");
await delay(0);
emitLanguageClick("zh");
await delay(0);
assert.equal(deferredPreferenceWrites.length, 1, "concurrent language clicks started parallel VPS writes");
assert.equal(deferredPreferenceWrites[0].preferredLanguage, "vi");
assert.equal(JSON.parse(storage.get(PENDING_LANGUAGE_KEY) || "null")?.preferredLanguage, "zh-TW", "latest language intent did not replace the older pending value");

deferredPreferenceWrites[0].resolve();
await delay(0);
assert.equal(deferredPreferenceWrites.length, 2, "latest language intent was not flushed after the first write settled");
assert.equal(deferredPreferenceWrites[1].preferredLanguage, "zh-TW", "coalesced follow-up write did not use the latest language intent");
assert.equal(storage.has(PENDING_LANGUAGE_KEY), true, "pending latest language cleared before its VPS write completed");

deferredPreferenceWrites[1].resolve();
await delay(20);
assert.equal(serverPreferredLanguage, "zh-TW", "serialized preference writes did not leave the server on the latest language");
assert.equal(JSON.parse(storage.get(AUTH_KEY)).preferredLanguage, "zh-TW", "session mirror did not end on the latest language");
assert.equal(storage.has(PENDING_LANGUAGE_KEY), false, "latest confirmed language left stale pending state");

console.log("DEVICE_SYNC_RUNTIME_OK");
