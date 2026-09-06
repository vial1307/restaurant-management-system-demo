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
const saves = [];
globalThis.__testBusinessSave = async (site, modules, expectedModuleRevisions) => {
  saves.push({ site, modules: structuredClone(modules), expectedModuleRevisions: structuredClone(expectedModuleRevisions) });
  const next = saves.length === 1 ? 12 : 13;
  return { ok: true, revision: 20 + saves.length, savedModules: ["settings"], moduleRevisions: { settings: next } };
};

const persistence = [];
window.addEventListener("shitu:business-persistence-status", (event) => persistence.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(state.settings.reservationBuffer, 3);

state = { ...state, settings: { ...state.settings, reservationBuffer: 4 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saves.length, 1);
assert.deepEqual(saves[0].expectedModuleRevisions, { settings: 11 }, "first dirty save did not use GET module revision");
assert.equal(persistence.at(-1)?.status, "saved");

state = { ...state, settings: { ...state.settings, reservationBuffer: 5 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saves.length, 2);
assert.deepEqual(saves[1].expectedModuleRevisions, { settings: 12 }, "confirmed module revision was not advanced for the next write");

const readsBeforeConflict = reads;
state = { ...state, settings: { ...state.settings, reservationBuffer: 6 } };
subscriber();
globalThis.__testBusinessSave = async (_site, _modules, expectedModuleRevisions) => {
  saves.push({ expectedModuleRevisions: structuredClone(expectedModuleRevisions) });
  const error = new Error("BUSINESS_STATE_CONFLICT");
  error.code = "BUSINESS_STATE_CONFLICT";
  error.status = 409;
  error.payload = { error: "BUSINESS_STATE_CONFLICT", conflictingModules: ["settings"], moduleRevisions: { settings: 14 } };
  throw error;
};
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.deepEqual(saves.at(-1).expectedModuleRevisions, { settings: 13 }, "conflicting write did not use last confirmed module revision");
assert.equal(state.settings.reservationBuffer, 6, "conflict overwrote the current local edit");
assert.equal(reads, readsBeforeConflict, "conflict triggered a stale GET over the local edit");
const conflictStatus = persistence.findLast((entry) => entry?.status === "error");
assert.equal(conflictStatus?.error, "BUSINESS_STATE_CONFLICT");
assert.notEqual(persistence.at(-1)?.status, "saved", "conflicting write emitted false saved status");

detach();
console.log("BUSINESS_STATE_MODULE_REVISION_OK");
