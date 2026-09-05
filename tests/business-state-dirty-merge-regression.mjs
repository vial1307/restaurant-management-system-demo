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
assert.notEqual(injected, source, "dirty merge test could not inject VPS API mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([[AUTH_KEY, JSON.stringify({
  id: "dirty-merge-user",
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
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
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
let submitted = null;
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  submitted = structuredClone(modules);
  serverRevision += 1;
  serverModules = { ...serverModules, ...structuredClone(modules) };
  return { revision: serverRevision, savedModules: Object.keys(modules) };
};

const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(state.settings.reservationBuffer, 3);
assert.equal(state.records[date]?.reservation?.lunch, 1);

// Another device changes reservations after this device's baseline was loaded.
serverRevision = 2;
serverModules = {
  ...serverModules,
  reservations: {
    records: {
      [date]: {
        reservation: { lunch: 5, dinner: 0 },
        riceRemaining: 0,
        updatedAt: null,
      },
    },
  },
};

// This device changes only settings. The write must not include stale reservations.
state = { ...state, settings: { ...state.settings, reservationBuffer: 9 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.deepEqual(Object.keys(submitted || {}), ["settings"], "dirty save included a stale remote reservations module");
assert.equal(serverModules.settings.reservationBuffer, 9, "local dirty settings were not persisted");
assert.equal(serverModules.reservations.records[date].reservation.lunch, 5, "dirty settings save overwrote the other device's reservation update");

// The post-save refresh must still fetch/merge the newly advanced server revision.
assert(readCalls >= 2, "post-save refresh did not read the newer server revision");
assert.equal(state.records[date]?.reservation?.lunch, 5, "client short-circuited on its save revision and failed to merge the other device's module update");
assert.equal(state.settings.reservationBuffer, 9);

detach();
console.log("BUSINESS_STATE_DIRTY_MERGE_OK");
