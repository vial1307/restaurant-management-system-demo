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
assert.notEqual(injected, source, "auth transition test could not inject VPS API mocks");

const APP_KEY = "shitu-kitchen-os-v1";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const oldSession = {
  id: "transition-user",
  username: "transition",
  name: "Transition User",
  role: "branch",
  accountRole: "manager",
  location: "fuxing",
  permissions: {
    settings: { view: true, edit: true },
    reservations: { view: true, edit: true },
  },
  preferredLanguage: "vi",
  provider: "vps",
};
const storage = new Map([
  [APP_KEY, JSON.stringify({ settings: { language: "vi" } })],
  [AUTH_KEY, JSON.stringify(oldSession)],
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
    this.cancelable = Boolean(options.cancelable);
    this.defaultPrevented = false;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
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
    return !event.defaultPrevented;
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

const serverUser = {
  id: "transition-user",
  username: "transition",
  displayName: "Transition User",
  role: "manager",
  location: "yongji",
  permissions: {
    settings: { view: true, edit: false },
    reservations: { view: true, edit: false },
  },
  preferredLanguage: "vi",
  active: true,
};
globalThis.__testVpsMe = async () => ({ user: serverUser });
globalThis.__testVpsListUsers = async () => ({ users: [] });
globalThis.__testVpsUpdatePreferences = async () => ({ user: serverUser });

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
await import(moduleUrl);

let preparingEvents = 0;
let preparingSession = null;
let preparingDetail = null;
let syncedEvents = 0;
let syncedSession = null;
let syncedDetail = null;
window.addEventListener("shitu:auth-transition-preparing", (event) => {
  preparingEvents += 1;
  preparingSession = JSON.parse(storage.get(AUTH_KEY) || "null");
  preparingDetail = event.detail;
});
window.addEventListener("shitu:auth-synced", (event) => {
  syncedEvents += 1;
  syncedSession = JSON.parse(storage.get(AUTH_KEY) || "null");
  syncedDetail = event.detail;
});

const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));
document.documentElement.dataset.vpsAuthReady = "true";
window.dispatchEvent(new CustomEvent("shitu:vps-auth-ready"));
await delay(20);

assert.equal(preparingEvents, 1, "authorization change did not emit a pre-transition recovery event");
assert.equal(preparingSession?.location, "fuxing", "old session was replaced before recovery listeners could capture the prior site");
assert.equal(preparingSession?.permissions?.settings?.edit, true, "old permissions were replaced before recovery capture");
assert.equal(preparingDetail?.authorizationChanged, true);
assert.equal(preparingDetail?.previous?.location, "fuxing");
assert.equal(preparingDetail?.next?.location, "yongji");
assert.equal(preparingDetail?.previous?.permissions?.settings?.edit, true);
assert.equal(preparingDetail?.next?.permissions?.settings?.edit, false);

assert.equal(syncedEvents, 1, "authorization change did not emit the normal auth-synced event");
assert.equal(syncedDetail?.authorizationChanged, true, "auth-synced did not identify the authorization boundary change");
assert.equal(syncedSession?.location, "yongji", "validated new workplace was not applied after recovery capture");
assert.equal(syncedSession?.permissions?.settings?.edit, false, "revoked permission remained active after validated profile sync");
assert.equal(JSON.parse(storage.get(AUTH_KEY) || "null")?.location, "yongji");

console.log("DEVICE_SYNC_AUTH_TRANSITION_OK");
