import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const importLine = 'import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";';
const injected = source.replace(importLine, `
const isVpsApiConfigured = () => true;
const vpsBusinessState = (...args) => globalThis.__scopeDraftRead(...args);
const vpsSaveBusinessState = (...args) => globalThis.__scopeDraftSave(...args);
`);
assert.notEqual(injected, source, "reload draft scope test could not inject VPS mocks");
const { attachBusinessStateSync } = await import(`data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const PENDING_KEY = "shitu-business-pending-v1";
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
globalThis.location = { reload() {} };

function auth(userId, location, permissions) {
  return JSON.stringify({ id: userId, location, permissions });
}

function pendingRecord(userId, site, value, token, extra = {}) {
  return {
    userId,
    site,
    capturedAt: "2026-09-06T07:00:00.000Z",
    changedModules: ["settings"],
    modules: { settings: { reservationBuffer: value, ...extra } },
    expectedModuleRevisions: { settings: token },
  };
}

function pendingEnvelope(entries) {
  return JSON.stringify({ version: 1, drafts: Object.fromEntries(entries) });
}

function installEnvironment({ authValue, activeSite = "", drafts = [] }) {
  const storage = new Map([[AUTH_KEY, authValue]]);
  if (activeSite) storage.set(ACTIVE_SITE_KEY, activeSite);
  if (drafts.length) storage.set(PENDING_KEY, pendingEnvelope(drafts));
  globalThis.localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

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
  return { storage };
}

function createStore(initialBuffer = 0) {
  let state = {
    settings: { reservationBuffer: initialBuffer, language: "vi", employeeName: "Test", workstation: "noodles" },
    records: {},
    operations: {},
  };
  let listeners = new Set();
  return {
    getState() { return state; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    mergeBusinessModules(modules) {
      if (modules?.settings) state.settings = { ...state.settings, ...structuredClone(modules.settings), language: state.settings.language };
      if (modules?.attendance) state.operations = { ...state.operations, ...structuredClone(modules.attendance) };
      for (const listener of [...listeners]) listener(state);
      return state;
    },
    editBuffer(value) {
      state = { ...state, settings: { ...state.settings, reservationBuffer: value } };
      for (const listener of [...listeners]) listener(state);
    },
  };
}

function readDraft(storage, key) {
  try { return JSON.parse(storage.get(PENDING_KEY) || "null")?.drafts?.[key] || null; }
  catch { return null; }
}

// User isolation: user B must neither apply nor delete user A's Fuxing draft.
{
  const draft = pendingRecord("user-a", "fuxing", 6, 11);
  const env = installEnvironment({
    authValue: auth("user-b", "fuxing", { settings: { view: true, edit: true } }),
    drafts: [["user-a:fuxing", draft]],
  });
  let saves = 0;
  globalThis.__scopeDraftRead = async () => ({
    revision: 5,
    moduleRevisions: { settings: 11 },
    modules: { settings: { reservationBuffer: 3 } },
  });
  globalThis.__scopeDraftSave = async () => { saves += 1; throw new Error("unexpected write"); };
  const store = createStore();
  const detach = attachBusinessStateSync(store);
  await delay(20);
  assert.equal(store.getState().settings.reservationBuffer, 3, "another user's pending draft was applied");
  assert.equal(readDraft(env.storage, "user-a:fuxing")?.modules.settings.reservationBuffer, 6, "another user's pending draft was deleted");
  assert.equal(saves, 0, "another user's pending draft triggered a write");
  detach();
}

// Site isolation: the same user's Fuxing draft must stay dormant while operating Yongji.
{
  const draft = pendingRecord("user-a", "fuxing", 6, 11);
  const env = installEnvironment({
    authValue: auth("user-a", "all", { settings: { view: true, edit: true } }),
    activeSite: "yongji",
    drafts: [["user-a:fuxing", draft]],
  });
  let saves = 0;
  globalThis.__scopeDraftRead = async (site) => {
    assert.equal(site, "yongji");
    return { revision: 7, moduleRevisions: { settings: 4 }, modules: { settings: { reservationBuffer: 8 } } };
  };
  globalThis.__scopeDraftSave = async () => { saves += 1; throw new Error("unexpected write"); };
  const store = createStore();
  const detach = attachBusinessStateSync(store);
  await delay(20);
  assert.equal(store.getState().settings.reservationBuffer, 8, "Fuxing draft leaked into Yongji state");
  assert.equal(readDraft(env.storage, "user-a:fuxing")?.modules.settings.reservationBuffer, 6, "operating Yongji deleted the Fuxing draft");
  assert.equal(saves, 0);
  detach();
}

// Permission safety: a drafted module no longer exposed by GET must not be overlaid
// or copied into persistence events. The dormant draft remains device-scoped.
{
  const secret = "PENDING_SECRET_MUST_NOT_SURFACE_7d91";
  const draft = pendingRecord("permission-user", "fuxing", 6, 11, { internalSecret: secret });
  const env = installEnvironment({
    authValue: auth("permission-user", "fuxing", { attendance: { view: true, edit: false } }),
    drafts: [["permission-user:fuxing", draft]],
  });
  let saves = 0;
  globalThis.__scopeDraftRead = async () => ({
    revision: 8,
    moduleRevisions: { attendance: 2 },
    modules: { attendance: { attendance: [], payroll: {} } },
  });
  globalThis.__scopeDraftSave = async () => { saves += 1; throw new Error("unexpected write"); };
  const statuses = [];
  window.addEventListener("shitu:business-persistence-status", (event) => statuses.push(structuredClone(event.detail)));
  const store = createStore(0);
  const detach = attachBusinessStateSync(store);
  await delay(20);
  assert.equal(store.getState().settings.reservationBuffer, 0, "revoked settings draft was overlaid into active state");
  assert.equal(readDraft(env.storage, "permission-user:fuxing")?.modules.settings.reservationBuffer, 6, "revoked settings draft was deleted");
  assert.equal(saves, 0, "revoked settings draft triggered a write");
  assert.equal(statuses.some((entry) => entry.modules?.includes("settings")), false, "revoked module name leaked into persistence status");
  assert.equal(JSON.stringify(statuses).includes(secret), false, "draft payload leaked into persistence status");
  detach();
}

// Failure lifecycle: partial confirmation, revision-required, offline, and timeout
// must all leave the exact pending draft intact and must never emit a false saved state.
{
  const env = installEnvironment({
    authValue: auth("failure-user", "fuxing", { settings: { view: true, edit: true } }),
  });
  let mode = "partial";
  globalThis.__scopeDraftRead = async () => ({
    revision: 9,
    moduleRevisions: { settings: 5 },
    modules: { settings: { reservationBuffer: 1 } },
  });
  globalThis.__scopeDraftSave = async () => {
    if (mode === "partial") return { ok: true, savedModules: [], moduleRevisions: {}, revision: 9 };
    throw new Error(mode);
  };
  const statuses = [];
  window.addEventListener("shitu:business-persistence-status", (event) => statuses.push(structuredClone(event.detail)));
  const store = createStore();
  const detach = attachBusinessStateSync(store);
  await delay(20);
  store.editBuffer(2);
  assert.equal(readDraft(env.storage, "failure-user:fuxing")?.modules.settings.reservationBuffer, 2, "dirty edit was not captured synchronously");

  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert(readDraft(env.storage, "failure-user:fuxing"), "partial confirmation cleared pending draft");

  mode = "BUSINESS_STATE_REVISION_REQUIRED";
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert(readDraft(env.storage, "failure-user:fuxing"), "revision-required cleared pending draft");

  navigator.onLine = false;
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert(readDraft(env.storage, "failure-user:fuxing"), "offline state cleared pending draft");

  navigator.onLine = true;
  mode = "REQUEST_TIMEOUT";
  window.dispatchEvent(new CustomEvent("focus"));
  await delay(20);
  assert(readDraft(env.storage, "failure-user:fuxing"), "timeout cleared pending draft");
  assert.equal(statuses.some((entry) => entry.status === "saved"), false, "failed persistence emitted false saved status");
  detach();
}

console.log("BUSINESS_STATE_RELOAD_SCOPE_OK");
console.log("BUSINESS_STATE_RELOAD_PERMISSION_OK");
console.log("BUSINESS_STATE_RELOAD_FAILURE_LIFECYCLE_OK");
