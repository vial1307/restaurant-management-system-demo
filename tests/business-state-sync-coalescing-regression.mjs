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
assert.notEqual(injected, source, "coalescing regression could not inject VPS API mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([[AUTH_KEY, JSON.stringify({
  id: "coalesce-user",
  location: "fuxing",
  permissions: { settings: { view: true, edit: true } },
})]]);
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});

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
const nativeClearTimeout = globalThis.clearTimeout;
globalThis.window = {
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) {
    windowListeners.get(type)?.delete(listener);
  },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) || []) listener(event);
    return !event.defaultPrevented;
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
  removeEventListener(type, listener) {
    documentListeners.get(type)?.delete(listener);
  },
};
globalThis.location = { reload() {} };

const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));
function emitDocument(type) {
  const event = new CustomEvent(type);
  for (const listener of documentListeners.get(type) || []) listener(event);
}

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
  },
};

let readCalls = 0;
globalThis.__testVpsBusinessState = async () => {
  readCalls += 1;
  return { revision: 1, modules: { settings: { reservationBuffer: 3 } } };
};
let saveCalls = 0;
const deferredSaves = [];
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  return new Promise((resolve) => {
    deferredSaves.push({
      buffer: modules.settings?.reservationBuffer,
      resolve,
    });
  });
};

const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(readCalls, 1, "initial business-state load did not complete");
assert.equal(state.settings.reservationBuffer, 3, "initial business-state baseline was not applied");

// Mobile resume often emits visibilitychange followed immediately by focus.
// Both triggers must share one in-flight write for the same snapshot.
state = { ...state, settings: { ...state.settings, reservationBuffer: 30 } };
subscriber();
document.visibilityState = "visible";
emitDocument("visibilitychange");
window.dispatchEvent(new CustomEvent("focus"));
await delay(0);
assert.equal(deferredSaves.length, 1, "visible-resume plus focus created duplicate writes for one snapshot");
assert.equal(deferredSaves[0].buffer, 30, "coalesced save did not capture the intended snapshot");

deferredSaves[0].resolve({ revision: 2 });
await delay(20);
assert.equal(saveCalls, 1, "same-snapshot triggers advanced the business revision more than once");

// A newer edit arriving during an in-flight save must serialize behind it,
// not start a parallel write and not get lost when the first write completes.
state = { ...state, settings: { ...state.settings, reservationBuffer: 31 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(0);
assert.equal(deferredSaves.length, 2, "second persistence cycle did not start");
assert.equal(deferredSaves[1].buffer, 31);

state = { ...state, settings: { ...state.settings, reservationBuffer: 32 } };
subscriber();
emitDocument("visibilitychange");
window.dispatchEvent(new CustomEvent("focus"));
await delay(0);
assert.equal(deferredSaves.length, 2, "newer snapshot started a parallel write while the prior save was in flight");

deferredSaves[1].resolve({ revision: 3 });
await delay(0);
assert.equal(deferredSaves.length, 3, "newer edit was not queued after the in-flight save settled");
assert.equal(deferredSaves[2].buffer, 32, "queued follow-up save did not use the latest local snapshot");
deferredSaves[2].resolve({ revision: 4 });
await delay(20);
assert.equal(state.settings.reservationBuffer, 32, "latest local edit was lost during serialized persistence");
assert.equal(saveCalls, 3, "serialized persistence wrote an unexpected number of revisions");

detach();
console.log("BUSINESS_STATE_SYNC_COALESCING_OK");
