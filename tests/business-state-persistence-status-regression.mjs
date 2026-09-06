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
assert.notEqual(injected, source, "persistence-status test could not inject VPS mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map([[AUTH_KEY, JSON.stringify({
  id: "status-user",
  username: "status-user",
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
    this.cancelable = Boolean(options.cancelable);
    this.defaultPrevented = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
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
  removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener); },
};
globalThis.location = { reload() {} };
const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

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

let serverRevision = 1;
let serverBuffer = 3;
globalThis.__testVpsBusinessState = async () => ({
  revision: serverRevision,
  modules: { settings: { reservationBuffer: serverBuffer } },
});
let saveCalls = 0;
let heldSaveResolve = null;
let failNextSave = false;
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  if (failNextSave) {
    failNextSave = false;
    throw new Error("TEST_PERSISTENCE_FAILURE");
  }
  if (heldSaveResolve !== false) {
    return new Promise((resolve) => {
      heldSaveResolve = () => {
        serverRevision += 1;
        serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
        resolve({ ok: true, revision: serverRevision, savedModules: Object.keys(modules) });
      };
    });
  }
  serverRevision += 1;
  serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
  return { ok: true, revision: serverRevision, savedModules: Object.keys(modules) };
};

const statuses = [];
window.addEventListener("shitu:business-persistence-status", (event) => statuses.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.equal(state.settings.reservationBuffer, 3, "initial business baseline did not load");
assert.equal(statuses.length, 0, "initial read emitted a false business persistence lifecycle");

// Local mutation must immediately become visibly pending before the debounce POST fires.
state = { ...state, settings: { ...state.settings, reservationBuffer: 9 } };
subscriber();
const pending = statuses.at(-1);
assert.equal(pending?.status, "pending", "dirty local business edit did not emit pending persistence status");
assert.equal(pending?.userId, "status-user", "pending status is not scoped to the authenticated user");
assert.equal(pending?.site, "fuxing", "pending status is not scoped to the business site");
assert.deepEqual(pending?.modules, ["settings"], "pending status does not describe the dirty top-level modules");

// The debounce eventually starts exactly one scoped saving lifecycle.
await delay(480);
assert.equal(saveCalls, 1, "debounced dirty edit did not start one VPS write");
const saving = statuses.findLast((entry) => entry?.status === "saving");
assert.equal(saving?.userId, "status-user", "saving status lost user scope");
assert.equal(saving?.site, "fuxing", "saving status lost site scope");
assert.deepEqual(saving?.modules, ["settings"], "saving status lost dirty module metadata");
assert.equal(typeof heldSaveResolve, "function", "test save did not remain in flight");

heldSaveResolve();
await delay(20);
const saved = statuses.findLast((entry) => entry?.status === "saved");
assert.equal(saved?.userId, "status-user", "saved status lost user scope");
assert.equal(saved?.site, "fuxing", "saved status lost site scope");
assert.deepEqual(saved?.modules, ["settings"], "saved status lost confirmed module metadata");

// A no-op focus refresh after a confirmed snapshot must not claim another save.
heldSaveResolve = false;
const lifecycleBeforeNoop = statuses.length;
const savesBeforeNoop = saveCalls;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(saveCalls, savesBeforeNoop, "clean focus refresh created a false VPS business write");
assert.equal(statuses.length, lifecycleBeforeNoop, "clean focus refresh emitted a false persistence lifecycle");

// If the user edits again while an older write is in flight, the old confirmation
// must not replace the newer pending state with a false saved indication.
state = { ...state, settings: { ...state.settings, reservationBuffer: 10 } };
subscriber();
let resolveOlderWrite = null;
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  return new Promise((resolve) => {
    resolveOlderWrite = () => {
      serverRevision += 1;
      serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
      resolve({ ok: true, revision: serverRevision, savedModules: Object.keys(modules) });
    };
  });
};
window.dispatchEvent(new CustomEvent("focus"));
await delay(0);
assert.equal(typeof resolveOlderWrite, "function", "older write did not enter the in-flight state");
state = { ...state, settings: { ...state.settings, reservationBuffer: 11 } };
subscriber();
const savedBeforeOlderCompletion = statuses.filter((entry) => entry?.status === "saved").length;
assert.equal(statuses.at(-1)?.status, "pending", "newer edit did not replace saving state with pending");
resolveOlderWrite();
await delay(20);
assert.equal(
  statuses.filter((entry) => entry?.status === "saved").length,
  savedBeforeOlderCompletion,
  "older write confirmation falsely reported the newer local edit as saved"
);
assert.equal(statuses.at(-1)?.status, "pending", "older write completion cleared the newer pending status");

globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  serverRevision += 1;
  serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
  return { ok: true, revision: serverRevision, savedModules: Object.keys(modules) };
};
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
assert.equal(statuses.at(-1)?.status, "saved", "newer current snapshot did not receive a confirmed saved state");

// Failed persistence must be scoped and must never be followed by a false saved event.
state = { ...state, settings: { ...state.settings, reservationBuffer: 12 } };
subscriber();
failNextSave = true;
globalThis.__testVpsSaveBusinessState = async () => {
  saveCalls += 1;
  if (failNextSave) {
    failNextSave = false;
    throw new Error("TEST_PERSISTENCE_FAILURE");
  }
  return { ok: true, revision: ++serverRevision, savedModules: ["settings"] };
};
const savedCountBeforeFailure = statuses.filter((entry) => entry?.status === "saved").length;
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
const error = statuses.findLast((entry) => entry?.status === "error");
assert.equal(error?.userId, "status-user", "persistence failure is not scoped to the authenticated user");
assert.equal(error?.site, "fuxing", "persistence failure is not scoped to the business site");
assert.equal(error?.error, "TEST_PERSISTENCE_FAILURE", "persistence failure error class was lost");
assert.equal(statuses.filter((entry) => entry?.status === "saved").length, savedCountBeforeFailure, "failed write emitted a false saved state");

// A later confirmed write for the same scope must recover from that failure.
globalThis.__testVpsSaveBusinessState = async (_site, modules) => {
  saveCalls += 1;
  serverRevision += 1;
  serverBuffer = Number(modules.settings?.reservationBuffer ?? serverBuffer);
  return { ok: true, revision: serverRevision, savedModules: Object.keys(modules) };
};
window.dispatchEvent(new CustomEvent("focus"));
await delay(20);
const recovered = statuses.findLast((entry) => entry?.status === "saved");
assert.equal(recovered?.userId, "status-user");
assert.equal(recovered?.site, "fuxing");
assert.deepEqual(recovered?.modules, ["settings"]);

detach();
console.log("BUSINESS_STATE_PERSISTENCE_STATUS_OK");
