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
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
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

const documentListeners = new Map();
globalThis.document = {
  documentElement: { dataset: { vpsAuthReady: "true" } },
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) {
    documentListeners.get(type)?.delete(listener);
  },
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

let acceptedWarehouseClicks = 0;
function emitWarehouseClick(site) {
  let stopped = false;
  const button = {
    dataset: { warehouse: site },
    click() { emitWarehouseClick(site); },
  };
  const event = {
    type: "click",
    target: {
      closest(selector) { return selector === "[data-warehouse]" ? button : null; },
    },
    preventDefault() {},
    stopImmediatePropagation() { stopped = true; },
  };
  for (const listener of documentListeners.get("click") || []) {
    listener(event);
    if (stopped) break;
  }
  if (!stopped) {
    acceptedWarehouseClicks += 1;
    storage.set(ACTIVE_SITE_KEY, site);
    window.dispatchEvent(new CustomEvent("shitu:active-site-changed", { detail:{ site } }));
  }
}

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

// Auth/profile refresh must flush the pending debounce before it reloads VPS state.
state = { ...state, settings: { ...state.settings, reservationBuffer: 16 } };
subscriber();
const authSyncOrder = [];
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  authSyncOrder.push(`save:${modules.settings?.reservationBuffer}`);
  return { revision: 5 };
};
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  authSyncOrder.push("load");
  return { revision: 5, modules: { settings: { reservationBuffer: 16 } } };
};
window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
await delay(20);
assert.deepEqual(authSyncOrder.slice(0, 2), ["save:16", "load"], "auth sync reloaded before flushing the pending business edit");
assert.equal(state.settings.reservationBuffer, 16, "auth sync lost the pending business edit");

// VPS-auth readiness refresh uses the same save-before-load contract after bootstrap.
state = { ...state, settings: { ...state.settings, reservationBuffer: 17 } };
subscriber();
const authReadyOrder = [];
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  authReadyOrder.push(`save:${modules.settings?.reservationBuffer}`);
  return { revision: 6 };
};
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  authReadyOrder.push("load");
  return { revision: 6, modules: { settings: { reservationBuffer: 17 } } };
};
window.dispatchEvent(new CustomEvent("shitu:vps-auth-ready"));
await delay(20);
assert.deepEqual(authReadyOrder.slice(0, 2), ["save:17", "load"], "VPS auth readiness reloaded before flushing the pending business edit");
assert.equal(state.settings.reservationBuffer, 17, "VPS auth readiness lost the pending business edit");

// Admin warehouse switching must not discard an unsaved business-state edit.
storage.set(AUTH_KEY, JSON.stringify({
  id: "business-sync-user",
  location: "all",
  permissions: { settings: { view: true, edit: true } },
}));
storage.set(ACTIVE_SITE_KEY, "fuxing");
state = { ...state, settings: { ...state.settings, reservationBuffer: 13 } };
subscriber();
navigator.onLine = false;
emitWarehouseClick("yongji");
await delay(20);
assert.equal(acceptedWarehouseClicks, 0, "offline warehouse switch bypassed the unsaved-state guard");
assert.equal(storage.get(ACTIVE_SITE_KEY), "fuxing", "offline warehouse switch changed the active site");
assert.equal(state.settings.reservationBuffer, 13, "offline warehouse switch discarded the local edit");

navigator.onLine = true;
let switchSaveSite = "";
let switchSaveBuffer = -1;
globalThis.__testVpsSaveBusinessState = async (site, modules) => {
  saveCalls += 1;
  switchSaveSite = site;
  switchSaveBuffer = modules.settings?.reservationBuffer;
  return { revision: 7 };
};
globalThis.__testVpsBusinessState = async (site) => {
  readCalls += 1;
  return { revision: 8, modules: { settings: { reservationBuffer: site === "yongji" ? 6 : 13 } } };
};
emitWarehouseClick("yongji");
await delay(20);
assert.equal(switchSaveSite, "fuxing", "warehouse switch saved business state to the destination instead of the source site");
assert.equal(switchSaveBuffer, 13, "warehouse switch did not persist the latest source-site edit");
assert.equal(acceptedWarehouseClicks, 1, "warehouse switch was not replayed after a successful source-site save");
assert.equal(storage.get(ACTIVE_SITE_KEY), "yongji", "successful guarded warehouse switch did not reach the destination");

// A newer edit during the pre-switch save must cancel the switch and remain local.
state = { ...state, settings: { ...state.settings, reservationBuffer: 14 } };
subscriber();
let resolveSwitchSave = null;
globalThis.__testVpsSaveBusinessState = async () => {
  saveCalls += 1;
  return new Promise((resolve) => {
    resolveSwitchSave = () => resolve({ revision: 9 });
  });
};
emitWarehouseClick("fuxing");
await delay(0);
assert.equal(typeof resolveSwitchSave, "function", "guarded warehouse switch did not start the source-site save");
state = { ...state, settings: { ...state.settings, reservationBuffer: 15 } };
subscriber();
resolveSwitchSave();
await delay(20);
assert.equal(acceptedWarehouseClicks, 1, "warehouse switch continued after a newer local edit appeared");
assert.equal(storage.get(ACTIVE_SITE_KEY), "yongji", "newer local edit did not keep the current warehouse selected");
assert.equal(state.settings.reservationBuffer, 15, "newer local edit was lost while warehouse switch save completed");

// Keep the subscriber reachable so the test also verifies attach/cleanup wiring.
assert.equal(typeof subscriber, "function");
assert(saveCalls >= 6, "expected failed, in-flight, auth-refresh, and warehouse-switch save attempts");
detach();

console.log("BUSINESS_STATE_SYNC_RUNTIME_OK");