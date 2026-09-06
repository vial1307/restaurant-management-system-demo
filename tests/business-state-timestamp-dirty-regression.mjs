import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const importLine = 'import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";';
const injected = source.replace(importLine, `
const isVpsApiConfigured = () => true;
const vpsBusinessState = (...args) => globalThis.__testVpsBusinessState(...args);
const vpsSaveBusinessState = (...args) => globalThis.__testVpsSaveBusinessState(...args);
`);
assert.notEqual(injected, source, "timestamp dirty test could not inject VPS mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([[AUTH_KEY, JSON.stringify({
  id: "timestamp-user",
  username: "timestamp-user",
  role: "branch",
  accountRole: "manager",
  location: "fuxing",
  permissions: { settings: { view: true, edit: true } },
})]]);
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

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
const nativeClearTimeout = globalThis.clearTimeout;
globalThis.window = {
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) || []) listener(event);
    return true;
  },
  setTimeout: nativeSetTimeout,
  clearTimeout: nativeClearTimeout,
};
globalThis.document = {
  documentElement: { dataset: { vpsAuthReady: "true" } },
  visibilityState: "visible",
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener); },
};
globalThis.location = { reload() {} };
const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

const date = "2026-09-06";
let state = {
  settings: { reservationBuffer: 3, language: "vi" },
  records: {
    [date]: {
      reservation: { lunchTables: 1, dinnerTables: 0 },
      riceRemaining: 0,
      procurement: { planned: {}, incoming: {}, orderDates: {} },
      completedTasks: {},
      customTasks: [],
      updatedAt: "2026-09-06T01:00:00.000Z",
    },
  },
  operations: {},
};
let subscriber = () => {};
const store = {
  getState() { return state; },
  subscribe(listener) {
    subscriber = listener;
    return () => { subscriber = () => {}; };
  },
  mergeBusinessModules() {},
};

let saveCalls = 0;
globalThis.__testVpsBusinessState = async () => ({ revision: 1, modules: {} });
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  return { ok: true, revision: 2, savedModules: Object.keys(modules) };
};

const persistenceStatuses = [];
window.addEventListener("shitu:business-persistence-status", (event) => persistenceStatuses.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(saveCalls, 0, "initial business baseline unexpectedly wrote to VPS");
assert.equal(persistenceStatuses.length, 0, "initial business baseline emitted persistence lifecycle");

// Store.update() refreshes this shared timestamp for every mutation, including
// inventory-only mutations. Timestamp-only movement must not dirty business modules.
state = {
  ...state,
  records: {
    ...state.records,
    [date]: { ...state.records[date], updatedAt: "2026-09-06T01:05:00.000Z" },
  },
};
subscriber();
assert.equal(persistenceStatuses.length, 0, "shared record timestamp emitted false business pending status");
await delay(480);
assert.equal(saveCalls, 0, "shared record timestamp triggered an unnecessary business-state VPS write");
assert.equal(persistenceStatuses.length, 0, "timestamp-only change emitted a false business persistence lifecycle");

detach();
console.log("BUSINESS_STATE_TIMESTAMP_DIRTY_OK");
