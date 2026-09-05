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
assert.notEqual(injected, source, "business-state sync test could not inject VPS API mocks");

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([
  [AUTH_KEY, JSON.stringify({
    id: "business-sync-user",
    location: "fuxing",
    permissions: { settings: { view: true, edit: true } },
  })],
]);

globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});

globalThis.document = {
  documentElement: { dataset: { vpsAuthReady: "true" } },
};

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
globalThis.CustomEvent = TestCustomEvent;

const listeners = new Map();
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
globalThis.window = {
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  },
  removeEventListener(type, listener) {
    listeners.get(type)?.delete(listener);
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event);
    return true;
  },
  setTimeout: nativeSetTimeout,
  clearTimeout: nativeClearTimeout,
};

const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

let state = {
  settings: { reservationBuffer: 0, language: "vi" },
  records: {},
  operations: {},
};
let subscriber = () => {};
let mergeCount = 0;
const store = {
  getState() { return state; },
  subscribe(listener) {
    subscriber = listener;
    return () => { subscriber = () => {}; };
  },
  mergeBusinessModules(modules) {
    mergeCount += 1;
    if (modules.settings) {
      state = {
        ...state,
        settings: { ...state.settings, ...modules.settings },
      };
    }
  },
};

let readCalls = 0;
let saveCalls = 0;
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  return { revision: 1, modules: { settings: { reservationBuffer: 3 } } };
};
globalThis.__testVpsSaveBusinessState = async () => {
  saveCalls += 1;
  return { revision: 2 };
};

const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(readCalls, 1, "initial business-state load should run once");
assert.equal(mergeCount, 1, "initial server state should merge once");
assert.equal(state.settings.reservationBuffer, 3, "initial server state was not applied");

// A failed save must never be followed by a stale server reload.
state = { ...state, settings: { ...state.settings, reservationBuffer: 9 } };
globalThis.__testVpsSaveBusinessState = async () => {
  saveCalls += 1;
  throw new Error("TEST_SAVE_FAILURE");
};
const readsBeforeFailedSave = readCalls;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(readCalls, readsBeforeFailedSave, "failed save triggered a stale server reload");
assert.equal(state.settings.reservationBuffer, 9, "failed save overwrote the unsaved local edit");

// If the user edits again while a save is in flight, that newer edit must win.
state = { ...state, settings: { ...state.settings, reservationBuffer: 10 } };
let resolveSave = null;
globalThis.__testVpsSaveBusinessState = async () => {
  saveCalls += 1;
  return new Promise((resolve) => {
    resolveSave = () => resolve({ revision: 3 });
  });
};
const readsBeforeInFlightSave = readCalls;
window.dispatchEvent(new CustomEvent("focus"));
await delay(0);
assert.equal(typeof resolveSave, "function", "in-flight save was not started");
state = { ...state, settings: { ...state.settings, reservationBuffer: 11 } };
resolveSave();
await delay(20);
assert.equal(readCalls, readsBeforeInFlightSave, "newer local edit was followed by a stale reload after save");
assert.equal(state.settings.reservationBuffer, 11, "newer local edit was lost after save completion");

// If a local edit happens while a refresh read is in flight, defer that merge.
let resolveRead = null;
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  return new Promise((resolve) => {
    resolveRead = resolve;
  });
};
const mergesBeforeInFlightLoad = mergeCount;
window.dispatchEvent(new CustomEvent("shitu:active-site-changed"));
await delay(0);
assert.equal(typeof resolveRead, "function", "in-flight business-state read was not started");
state = { ...state, settings: { ...state.settings, reservationBuffer: 12 } };
resolveRead({ revision: 4, modules: { settings: { reservationBuffer: 4 } } });
await delay(20);
assert.equal(mergeCount, mergesBeforeInFlightLoad, "stale server read merged over an in-flight local edit");
assert.equal(state.settings.reservationBuffer, 12, "in-flight local edit was overwritten by server state");

// Keep the subscriber reachable so the test also verifies attach/cleanup wiring.
assert.equal(typeof subscriber, "function");
assert(saveCalls >= 2, "expected failed and in-flight save attempts");
detach();

console.log("BUSINESS_STATE_SYNC_RUNTIME_OK");
