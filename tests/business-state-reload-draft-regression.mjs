import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const importLine = 'import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";';
const injected = source.replace(importLine, `
const isVpsApiConfigured = () => true;
const vpsBusinessState = (...args) => globalThis.__reloadDraftRead(...args);
const vpsSaveBusinessState = (...args) => globalThis.__reloadDraftSave(...args);
`);
assert.notEqual(injected, source, "business sync transport injection failed");
const { attachBusinessStateSync } = await import(`data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const PENDING_KEY = "shitu-business-pending-v1";
const STORE_KEY = "reload-draft-test-store";
const nativeSetTimeout = globalThis.setTimeout;
const delay = (ms = 0) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

class TestEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.defaultPrevented = false;
    this.target = options.target || null;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() {}
}
globalThis.CustomEvent = TestEvent;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
globalThis.location = { reload() {} };

function makeState(reservationBuffer = 0) {
  return {
    settings: { reservationBuffer, language: "vi", employeeName: "Test", workstation: "noodles" },
    records: {},
    operations: {},
  };
}

function installEnvironment({ userId = "reload-user", site = "fuxing", storedState = null } = {}) {
  const storage = new Map();
  storage.set(AUTH_KEY, JSON.stringify({
    id: userId,
    location: site,
    permissions: {
      settings: { view: true, edit: true },
      attendance: { view: true, edit: true },
    },
  }));
  if (site === "all") storage.set(ACTIVE_SITE_KEY, "fuxing");
  if (storedState) storage.set(STORE_KEY, JSON.stringify(storedState));

  globalThis.localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };

  const windowListeners = new Map();
  const documentListeners = new Map();
  globalThis.window = {
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { windowListeners.get(type)?.delete(listener); },
    dispatchEvent(event) {
      for (const listener of [...(windowListeners.get(event.type) || [])]) listener(event);
      return !event.defaultPrevented;
    },
    setTimeout: nativeSetTimeout,
    clearTimeout: globalThis.clearTimeout,
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

  return { storage, windowListeners, documentListeners };
}

function makePersistentStore(storage, fallback = makeState()) {
  let state;
  try { state = JSON.parse(storage.get(STORE_KEY) || "null") || structuredClone(fallback); }
  catch { state = structuredClone(fallback); }
  let listeners = new Set();

  const persist = () => storage.set(STORE_KEY, JSON.stringify(state));
  persist();

  return {
    getState() { return state; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    mergeBusinessModules(modules) {
      if (modules?.settings) state.settings = { ...state.settings, ...structuredClone(modules.settings), language: state.settings.language };
      if (modules?.attendance) state.operations = { ...state.operations, ...structuredClone(modules.attendance) };
      persist();
      for (const listener of [...listeners]) listener(state);
      return state;
    },
    editReservationBuffer(value) {
      state.settings.reservationBuffer = value;
      persist();
      for (const listener of [...listeners]) listener(state);
    },
  };
}

function pendingDraft(storage, key = "reload-user:fuxing") {
  try { return JSON.parse(storage.get(PENDING_KEY) || "null")?.drafts?.[key] || null; }
  catch { return null; }
}

async function initialLoad(store) {
  const detach = attachBusinessStateSync(store);
  await delay(15);
  return detach;
}

// 1. A failed write must survive a full synchronizer/store recreation and retry
// with the exact accepted module token.
{
  const env = installEnvironment();
  let serverValue = 3;
  let serverToken = 11;
  const saveCalls = [];
  let failWrite = true;
  globalThis.__reloadDraftRead = async () => ({
    revision: 20,
    moduleRevisions: { settings: serverToken, attendance: 0 },
    modules: { settings: { reservationBuffer: serverValue } },
  });
  globalThis.__reloadDraftSave = async (_site, modules, expected) => {
    saveCalls.push({ modules: structuredClone(modules), expected: structuredClone(expected) });
    if (failWrite) throw new Error("API_UNREACHABLE");
    serverValue = modules.settings.reservationBuffer;
    serverToken += 1;
    return {
      ok: true,
      savedModules: ["settings"],
      moduleRevisions: { settings: serverToken },
      revision: 21,
    };
  };

  let store = makePersistentStore(env.storage);
  let detach = await initialLoad(store);
  assert.equal(store.getState().settings.reservationBuffer, 3);

  store.editReservationBuffer(6);
  const captured = pendingDraft(env.storage);
  assert(captured, "dirty edit was not durably captured before debounce");
  assert.equal(captured.modules.settings.reservationBuffer, 6);
  assert.deepEqual(captured.expectedModuleRevisions, { settings: 11 });

  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert.equal(saveCalls.length, 1, "failed dirty write was not attempted");
  assert(pendingDraft(env.storage), "failed write cleared the durable draft");
  detach();

  // Browser/process reload: rebuild both store and sync from the same device storage.
  store = makePersistentStore(env.storage);
  assert.equal(store.getState().settings.reservationBuffer, 6, "device store lost the edit before reload sync");
  failWrite = false;
  detach = await initialLoad(store);
  assert.equal(store.getState().settings.reservationBuffer, 6, "initial VPS GET overwrote the pending local edit after reload");
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(30);
  assert.equal(saveCalls.at(-1)?.modules.settings.reservationBuffer, 6);
  assert.deepEqual(saveCalls.at(-1)?.expected, { settings: 11 }, "reload retry did not preserve accepted revision 11");
  assert.equal(pendingDraft(env.storage), null, "confirmed retry did not clear durable draft");
  detach();
}

// 2. If another device advances the server while this browser is gone, reload
// must preserve the local draft and retain its old token so the retry conflicts.
{
  const env = installEnvironment();
  let serverValue = 3;
  let serverToken = 11;
  let failMode = "offline";
  const saveCalls = [];
  globalThis.__reloadDraftRead = async () => ({
    revision: 30,
    moduleRevisions: { settings: serverToken, attendance: 0 },
    modules: { settings: { reservationBuffer: serverValue } },
  });
  globalThis.__reloadDraftSave = async (_site, modules, expected) => {
    saveCalls.push({ modules: structuredClone(modules), expected: structuredClone(expected) });
    if (failMode === "offline") throw new Error("API_UNREACHABLE");
    if (expected.settings !== serverToken) {
      const error = new Error("BUSINESS_STATE_CONFLICT");
      error.status = 409;
      error.code = "BUSINESS_STATE_CONFLICT";
      throw error;
    }
    throw new Error("unexpected successful stale write");
  };

  let store = makePersistentStore(env.storage);
  let detach = await initialLoad(store);
  store.editReservationBuffer(6);
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert.deepEqual(pendingDraft(env.storage)?.expectedModuleRevisions, { settings: 11 });
  detach();

  serverValue = 8;
  serverToken = 12;
  failMode = "conflict";
  store = makePersistentStore(env.storage);
  detach = await initialLoad(store);
  assert.equal(store.getState().settings.reservationBuffer, 6, "newer server state replaced pending local draft on reload");
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(30);
  assert.deepEqual(saveCalls.at(-1)?.expected, { settings: 11 }, "reload adopted server token 12 over dirty draft token 11");
  assert.equal(store.getState().settings.reservationBuffer, 6, "conflict replaced current local draft");
  assert.equal(pendingDraft(env.storage)?.modules.settings.reservationBuffer, 6, "conflict cleared or mutated durable draft");
  detach();
}

// 3. A confirmed older in-flight write must rebase the durable draft for a newer
// local edit onto the returned token, so a crash before the next write can recover B.
{
  const env = installEnvironment();
  let serverValue = 3;
  let serverToken = 20;
  let holdResolve;
  let saveMode = "hold";
  const saveCalls = [];
  globalThis.__reloadDraftRead = async () => ({
    revision: 40,
    moduleRevisions: { settings: serverToken, attendance: 0 },
    modules: { settings: { reservationBuffer: serverValue } },
  });
  globalThis.__reloadDraftSave = async (_site, modules, expected) => {
    saveCalls.push({ modules: structuredClone(modules), expected: structuredClone(expected) });
    if (saveMode === "hold") {
      return await new Promise((resolve) => { holdResolve = resolve; });
    }
    serverValue = modules.settings.reservationBuffer;
    serverToken += 1;
    return { ok: true, savedModules: ["settings"], moduleRevisions: { settings: serverToken }, revision: 42 };
  };

  let store = makePersistentStore(env.storage);
  let detach = await initialLoad(store);
  store.editReservationBuffer(4);
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(10);
  assert.deepEqual(saveCalls[0]?.expected, { settings: 20 });

  store.editReservationBuffer(5);
  assert.equal(pendingDraft(env.storage)?.modules.settings.reservationBuffer, 5, "newer edit B did not replace durable draft A");
  assert.deepEqual(pendingDraft(env.storage)?.expectedModuleRevisions, { settings: 20 });

  serverValue = 4;
  serverToken = 21;
  holdResolve({ ok: true, savedModules: ["settings"], moduleRevisions: { settings: 21 }, revision: 41 });
  await delay(25);
  assert.equal(pendingDraft(env.storage)?.modules.settings.reservationBuffer, 5, "older confirmation replaced newer durable content B");
  assert.deepEqual(pendingDraft(env.storage)?.expectedModuleRevisions, { settings: 21 }, "newer draft B was not rebased onto confirmed token 21");
  detach();

  // Simulate crash before B reaches the server, then recover B from durable draft.
  saveMode = "success";
  store = makePersistentStore(env.storage);
  detach = await initialLoad(store);
  assert.equal(store.getState().settings.reservationBuffer, 5);
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(30);
  assert.equal(saveCalls.at(-1)?.modules.settings.reservationBuffer, 5);
  assert.deepEqual(saveCalls.at(-1)?.expected, { settings: 21 });
  assert.equal(pendingDraft(env.storage), null);
  detach();
}

console.log("BUSINESS_STATE_RELOAD_DRAFT_OK");
console.log("BUSINESS_STATE_RELOAD_CONFLICT_OK");
console.log("BUSINESS_STATE_RELOAD_REBASE_OK");
