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
let serverRevision = 20;
let serverModuleRevision = 11;
let serverBuffer = 3;
let holdNextRead = false;
let resolveHeldRead = null;
globalThis.__testBusinessRead = async () => {
  reads += 1;
  if (holdNextRead) {
    holdNextRead = false;
    return new Promise((resolve) => {
      resolveHeldRead = () => resolve({
        revision: 23,
        moduleRevisions: { settings: 14 },
        modules: { settings: { reservationBuffer: 99 } },
      });
    });
  }
  return {
    revision: serverRevision,
    moduleRevisions: { settings: serverModuleRevision },
    modules: { settings: { reservationBuffer: serverBuffer } },
  };
};

const saves = [];
let conflictNextSave = false;
globalThis.__testBusinessSave = async (site, modules, expectedModuleRevisions) => {
  saves.push({ site, modules: structuredClone(modules), expectedModuleRevisions: structuredClone(expectedModuleRevisions) });
  if (conflictNextSave) {
    conflictNextSave = false;
    const error = new Error("BUSINESS_STATE_CONFLICT");
    error.code = "BUSINESS_STATE_CONFLICT";
    error.status = 409;
    error.payload = { error: "BUSINESS_STATE_CONFLICT", conflictingModules: ["settings"], moduleRevisions: { settings: 14 } };
    throw error;
  }
  serverRevision += 1;
  serverModuleRevision += 1;
  serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
  return {
    ok: true,
    revision: serverRevision,
    savedModules: ["settings"],
    moduleRevisions: { settings: serverModuleRevision },
  };
};

const persistence = [];
const stateStatuses = [];
window.addEventListener("shitu:business-persistence-status", (event) => persistence.push(event.detail));
window.addEventListener("shitu:business-state-status", (event) => stateStatuses.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(state.settings.reservationBuffer, 3, "initial authoritative business state did not load");

// First guarded save must use the exact module revision from the accepted GET.
state = { ...state, settings: { ...state.settings, reservationBuffer: 4 } };
subscriber();
window.dispatchEvent(new CustomEvent("focus"));
await delay(30);
assert.equal(saves.length, 1, "first guarded business save did not run");
assert.deepEqual(saves[0].expectedModuleRevisions, { settings: 11 }, "first save did not use accepted GET token");
assert.equal(serverModuleRevision, 12);
assert.equal(state.settings.reservationBuffer, 4);

// Save another edit successfully, then hold the refresh GET. While that GET is
// in flight another device is represented by token 14, but the local user edits
// again before the response is accepted. The deferred GET must not advance the
// local concurrency baseline from the confirmed token 13 to remote token 14.
state = { ...state, settings: { ...state.settings, reservationBuffer: 5 } };
subscriber();
holdNextRead = true;
window.dispatchEvent(new CustomEvent("focus"));
for (let attempt = 0; attempt < 20 && typeof resolveHeldRead !== "function"; attempt += 1) await delay(2);
assert.equal(saves.length, 2, "second guarded business save did not run");
assert.deepEqual(saves[1].expectedModuleRevisions, { settings: 12 }, "confirmed token was not advanced to 12 for second save");
assert.equal(serverModuleRevision, 13);
assert.equal(typeof resolveHeldRead, "function", "post-save refresh did not enter the held GET state");

state = { ...state, settings: { ...state.settings, reservationBuffer: 6 } };
subscriber();
resolveHeldRead();
await delay(20);
assert.equal(state.settings.reservationBuffer, 6, "deferred GET overwrote the in-flight local edit");
assert(stateStatuses.some((entry) => entry?.status === "ready" && entry?.deferred === true), "in-flight local edit did not defer the remote merge");

const readsBeforeConflict = reads;
conflictNextSave = true;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saves.length, 3, "newer local edit did not attempt a guarded save");
assert.deepEqual(
  saves[2].expectedModuleRevisions,
  { settings: 13 },
  "deferred remote token 14 was incorrectly adopted by a local snapshot based on token 13"
);
assert.equal(state.settings.reservationBuffer, 6, "conflict overwrote the current local edit");
assert.equal(reads, readsBeforeConflict, "conflict triggered a stale GET over the local edit");
const conflictStatus = persistence.findLast((entry) => entry?.status === "error");
assert.equal(conflictStatus?.error, "BUSINESS_STATE_CONFLICT");
assert.notEqual(persistence.at(-1)?.status, "saved", "conflicting write emitted false saved status");

detach();
console.log("BUSINESS_STATE_MODULE_REVISION_BASELINE_OK");
console.log("BUSINESS_STATE_DEFERRED_REVISION_CONFLICT_OK");
