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
globalThis.__testVpsMe = async () => {
  meCalls += 1;
  if (meCalls === 1) throw new Error("TRANSIENT_PROFILE_SYNC_FAILURE");
  return {
    user: {
      id: "admin-1",
      username: "adminreg",
      displayName: "Admin Regression",
      role: "admin",
      location: "all",
      permissions: { settings: { view: true, edit: true } },
      preferredLanguage: "zh-TW",
      active: true,
    },
  };
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
      preferred_language: "zh-TW",
    }],
  };
};
globalThis.__testVpsUpdatePreferences = async () => ({ user: null });

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
await import(moduleUrl);

let authSyncedEvents = 0;
window.addEventListener("shitu:auth-synced", () => { authSyncedEvents += 1; });

const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));
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

console.log("DEVICE_SYNC_RUNTIME_OK");
