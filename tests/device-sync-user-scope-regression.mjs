import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/device-sync.js"), "utf8");
const importLine = 'import { vpsListUsers, vpsMe, vpsUpdatePreferences } from "./vps-api.js";';
const injected = source.replace(importLine, `
const vpsListUsers = (...args) => globalThis.__scopeTestVpsListUsers(...args);
const vpsMe = (...args) => globalThis.__scopeTestVpsMe(...args);
const vpsUpdatePreferences = (...args) => globalThis.__scopeTestVpsUpdatePreferences(...args);
`);
assert.notEqual(injected, source, "device-sync user-scope test could not inject VPS API mocks");

const APP_KEY = "shitu-kitchen-os-v1";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const PENDING_LANGUAGE_KEY = "shitu-kitchen-pending-language-v1";
const profile = (id, preferredLanguage = "vi") => ({
  id,
  username: id,
  displayName: id,
  role: "admin",
  location: "all",
  permissions: { settings: { view: true, edit: true } },
  preferredLanguage,
  active: true,
});
const session = (id, preferredLanguage = "vi") => ({
  id,
  username: id,
  name: id,
  role: "admin",
  accountRole: "admin",
  location: "all",
  permissions: { settings: { view: true, edit: true } },
  preferredLanguage,
  provider: "vps",
});

const storage = new Map([
  [APP_KEY, JSON.stringify({ settings: { language: "vi" } })],
  [AUTH_KEY, JSON.stringify(session("user-a"))],
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
globalThis.location = { reload() {} };

globalThis.__scopeTestVpsListUsers = async () => { throw new Error("UNEXPECTED_LIST_USERS"); };
globalThis.__scopeTestVpsMe = async () => { throw new Error("UNEXPECTED_ME"); };
let activePreferenceUserId = "user-a";
const serverLanguage = new Map([["user-a", "vi"], ["user-b", "vi"]]);
const writes = [];
globalThis.__scopeTestVpsUpdatePreferences = async (preferredLanguage) => {
  const userId = activePreferenceUserId;
  return new Promise((resolve) => {
    writes.push({
      userId,
      preferredLanguage,
      resolve() {
        serverLanguage.set(userId, preferredLanguage);
        resolve({ user: profile(userId, preferredLanguage) });
      },
    });
  });
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
await import(moduleUrl);
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
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

emitLanguageClick("zh");
await delay(0);
assert.equal(writes.length, 1, "user A preference write did not start");
assert.equal(writes[0].userId, "user-a");
assert.equal(writes[0].preferredLanguage, "zh-TW");

storage.set(AUTH_KEY, JSON.stringify(session("user-b")));
activePreferenceUserId = "user-b";
emitLanguageClick("zh");
await delay(0);
assert.equal(writes.length, 1, "user B reused the in-flight slot by starting a parallel write");
assert.equal(JSON.parse(storage.get(PENDING_LANGUAGE_KEY) || "null")?.userId, "user-b", "latest pending preference was not scoped to user B");

writes[0].resolve();
await delay(0);
await delay(0);
assert.equal(JSON.parse(storage.get(AUTH_KEY)).id, "user-b", "late user A response overwrote the active user B session");
assert.equal(writes.length, 2, "user B preference did not start after user A write settled");
assert.equal(writes[1].userId, "user-b", "queued preference write was sent under the wrong account");
assert.equal(writes[1].preferredLanguage, "zh-TW");

writes[1].resolve();
await delay(20);
const finalSession = JSON.parse(storage.get(AUTH_KEY));
assert.equal(finalSession.id, "user-b", "user B session was replaced after preference confirmation");
assert.equal(finalSession.preferredLanguage, "zh-TW", "user B confirmed preference was not mirrored");
assert.equal(storage.has(PENDING_LANGUAGE_KEY), false, "user B confirmed preference left stale pending state");

await import("./vps-auth-stale-response-regression.mjs");
console.log("DEVICE_SYNC_USER_SCOPE_OK");
