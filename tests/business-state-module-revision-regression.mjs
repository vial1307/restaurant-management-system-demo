import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const importLine = 'import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";';
const injected = source.replace(importLine, `
const isVpsApiConfigured = () => true;
const vpsBusinessState = (...args) => globalThis.__testBusinessRead(...args);
const vpsSaveBusinessState = (...args) => globalThis.__testBusinessSave(...args);
`);
assert.notEqual(injected, source);
const { attachBusinessStateSync } = await import(`data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`);

const storage = new Map([["shitu-kitchen-auth-v1", JSON.stringify({
  id: "revision-user", location: "fuxing", permissions: { settings: { view: true, edit: true } },
})]]);
globalThis.localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

class TestEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
}
globalThis.CustomEvent = TestEvent;
const windowListeners = new Map();
const documentListeners = new Map();
const nativeSetTimeout = globalThis.setTimeout;
globalThis.window = {
  addEventListener(type, listener) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(listener); },
  removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
  dispatchEvent(event) { for (const listener of windowListeners.get(event.type) || []) listener(event); return !event.defaultPrevented; },
  setTimeout: nativeSetTimeout,
  clearTimeout: globalThis.clearTimeout,
};
globalThis.document = {
  documentElement: { dataset: { vpsAuthReady: "true" } },
  visibilityState: "visible",
  addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, new Set()); documentListeners.get(type).add(listener); },
  removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener); },
};
globalThis.location = { reload() {} };
const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

let state = { settings: { reservationBuffer: 0, language: "vi" }, records: {}, operations: {} };
let subscriber = () => {};
const store = {
  getState() { return state; },
  subscribe(listener) { subscriber = listener; return () => { subscriber = () => {}; }; },
  mergeBusinessModules(modules) {
    if (modules.settings) state = { ...state, settings: { ...state.settings, ...modules.settings } };
  },
};

let reads = 0;
globalThis.__testBusinessRead = async () => {
  reads += 1;
  return { revision: 20, moduleRevisions: { settings: 11 }, modules: { settings: { reservationBuffer: 3 } } };
};
let saveCalls = 0;
globalThis.__testBusinessSave = async () => {
  saveCalls += 1;
  const error = new Error("BUSINESS_STATE_CONFLICT");
  error.code = "BUSINESS_STATE_CONFLICT";
  error.status = 409;
  error.payload = { error: "BUSINESS_STATE_CONFLICT", conflictingModules: ["settings"], moduleRevisions: { settings: 12 } };
  throw error;
};

const persistence = [];
window.addEventListener("shitu:business-persistence-status", (event) => persistence.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(state.settings.reservationBuffer, 3);

const readsBeforeConflict = reads;
state = { ...state, settings: { ...state.settings, reservationBuffer: 6 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saveCalls, 1, "conflicting dirty edit did not attempt one guarded save");
assert.equal(state.settings.reservationBuffer, 6, "conflict overwrote the current local edit");
assert.equal(reads, readsBeforeConflict, "conflict triggered a stale GET over the local edit");
const conflictStatus = persistence.findLast((entry) => entry?.status === "error");
assert.equal(conflictStatus?.error, "BUSINESS_STATE_CONFLICT");
assert.notEqual(persistence.at(-1)?.status, "saved", "conflicting write emitted false saved status");

detach();
console.log("BUSINESS_STATE_MODULE_CONFLICT_PRESERVATION_OK");
