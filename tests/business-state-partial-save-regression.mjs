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
assert.notEqual(injected, source, "partial-save test could not inject VPS API mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([[AUTH_KEY, JSON.stringify({
  id: "partial-save-user",
  username: "partial",
  role: "branch",
  accountRole: "manager",
  location: "fuxing",
  permissions: {
    settings: { view: true, edit: true },
    reservations: { view: true, edit: true },
  },
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
  settings: { reservationBuffer: 0, language: "vi" },
  records: {},
  operations: {},
};
let subscriber = () => {};
const store = {
  getState() { return state; },
  subscribe(listener) {
    subscriber = listener;
    return () => { subscriber = () => {}; };
  },
  mergeBusinessModules(modules) {
    if (modules.settings) state = { ...state, settings: { ...state.settings, ...modules.settings } };
    if (modules.reservations?.records) {
      const records = { ...state.records };
      for (const [key, value] of Object.entries(modules.reservations.records)) {
        records[key] = {
          ...(records[key] || {}),
          reservation: structuredClone(value.reservation || {}),
          riceRemaining: Number(value.riceRemaining || 0),
          updatedAt: value.updatedAt || null,
        };
      }
      state = { ...state, records };
    }
  },
};

let serverRevision = 1;
let serverModules = {
  settings: { reservationBuffer: 3 },
  reservations: {
    records: {
      [date]: {
        reservation: { lunch: 1, dinner: 0 },
        riceRemaining: 0,
        updatedAt: null,
      },
    },
  },
};
let readCalls = 0;
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  return { revision: serverRevision, modules: structuredClone(serverModules) };
};
let saveCalls = 0;
let lastSubmittedModules = null;
let partialResponse = true;
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  lastSubmittedModules = structuredClone(modules);
  if (partialResponse) {
    return { revision: serverRevision + 1, savedModules: ["settings"] };
  }
  serverRevision += 1;
  serverModules = { ...serverModules, ...structuredClone(modules) };
  return { revision: serverRevision, savedModules: Object.keys(modules) };
};

const statuses = [];
window.addEventListener("shitu:business-state-status", (event) => statuses.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(readCalls, 1, "initial business baseline did not load");
assert.equal(state.settings.reservationBuffer, 3);
assert.equal(state.records[date]?.reservation?.lunch, 1);

// Change exactly two top-level modules. The client should submit only those dirty modules.
state = {
  ...state,
  settings: { ...state.settings, reservationBuffer: 9 },
  records: {
    ...state.records,
    [date]: {
      ...state.records[date],
      reservation: { lunch: 4, dinner: 0 },
    },
  },
};
subscriber();
const readsBeforePartial = readCalls;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saveCalls, 1, "dirty business state was not sent to VPS");
assert.deepEqual(Object.keys(lastSubmittedModules || {}).sort(), ["reservations", "settings"], "save payload included unchanged business modules instead of only dirty modules");
assert.equal(readCalls, readsBeforePartial, "partial save confirmation still allowed a stale business-state refresh");
assert.equal(state.settings.reservationBuffer, 9, "partial save confirmation overwrote the local settings edit");
assert.equal(state.records[date]?.reservation?.lunch, 4, "partial save confirmation overwrote the local reservation edit");
assert(statuses.some((entry) => entry?.status === "error" && entry?.error === "BUSINESS_STATE_PARTIAL_SAVE"), "partial savedModules response was not surfaced as a persistence error");

// Once every dirty module is confirmed, the snapshot/revision may advance and refresh normally.
partialResponse = false;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saveCalls, 2, "unconfirmed dirty modules were not retried");
assert.deepEqual(Object.keys(lastSubmittedModules || {}).sort(), ["reservations", "settings"], "retry did not preserve the dirty-module write set");
assert.equal(readCalls, readsBeforePartial + 1, "fully confirmed dirty save did not allow the normal refresh");
assert.equal(serverModules.settings.reservationBuffer, 9);
assert.equal(serverModules.reservations.records[date].reservation.lunch, 4);

// With no new edit, a later focus must not create another business-state write.
const savesAfterConfirmed = saveCalls;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saveCalls, savesAfterConfirmed, "confirmed unchanged snapshot was written again");

detach();
console.log("BUSINESS_STATE_PARTIAL_SAVE_OK");
