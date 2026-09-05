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
assert.notEqual(injected, source, "auth recovery test could not inject VPS API mocks");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { attachBusinessStateSync } = await import(moduleUrl);

const AUTH_KEY = "shitu-kitchen-auth-v1";
const RECOVERY_KEY = "shitu-business-recovery-v1";
const initialSession = {
  id: "recovery-user",
  username: "recovery",
  name: "Recovery User",
  accountRole: "manager",
  role: "branch",
  location: "fuxing",
  permissions: {
    settings: { view: true, edit: true },
    reservations: { view: true, edit: true },
  },
  provider: "vps",
};
const storage = new Map([[AUTH_KEY, JSON.stringify(initialSession)]]);
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
      for (const [date, value] of Object.entries(modules.reservations.records)) {
        records[date] = {
          ...(records[date] || {}),
          reservation: value.reservation || {},
          riceRemaining: Number(value.riceRemaining || 0),
          updatedAt: value.updatedAt || null,
        };
      }
      state = { ...state, records };
    }
  },
};

const serverBySite = {
  fuxing: { revision: 5, modules: { settings: { reservationBuffer: 3 } } },
  yongji: { revision: 8, modules: { settings: { reservationBuffer: 7 } } },
};
let readCalls = [];
globalThis.__testVpsBusinessState = async (site) => {
  readCalls.push(site);
  return structuredClone(serverBySite[site]);
};
globalThis.__testVpsSaveBusinessState = async (_site, modules) => ({
  revision: 99,
  savedModules: Object.keys(modules || {}),
});

const statuses = [];
window.addEventListener("shitu:business-state-status", (event) => statuses.push(event.detail));
const detach = attachBusinessStateSync(store);
await delay(20);
assert.deepEqual(readCalls, ["fuxing"], "initial Fuxing business baseline was not loaded");
assert.equal(state.settings.reservationBuffer, 3);

// Dirty Fuxing state must be captured synchronously before a validated move to Yongji.
state = { ...state, settings: { ...state.settings, reservationBuffer: 9 } };
subscriber();
const nextYongji = {
  ...initialSession,
  location: "yongji",
};
window.dispatchEvent(new CustomEvent("shitu:auth-transition-preparing", {
  detail: {
    authorizationChanged: true,
    previous: initialSession,
    next: nextYongji,
  },
}));
const recoveryAfterCapture = JSON.parse(storage.get(RECOVERY_KEY) || "null");
const fuxingDraft = recoveryAfterCapture?.drafts?.["recovery-user:fuxing"];
assert(fuxingDraft, "authorization transition did not capture a Fuxing recovery draft");
assert.equal(fuxingDraft.userId, "recovery-user");
assert.equal(fuxingDraft.site, "fuxing");
assert.equal(fuxingDraft.baseRevision, 5);
assert.deepEqual(fuxingDraft.changedModules, ["settings"], "recovery draft copied unrelated unchanged modules");
assert.equal(fuxingDraft.modules.settings.reservationBuffer, 9);
assert.equal(fuxingDraft.reason, "authorization-transition");
assert(statuses.some((entry) => entry?.status === "recovery-pending" && entry?.site === "fuxing"), "recovery capture did not surface recovery-pending status");

// Security change still takes effect immediately; the old draft remains scoped to Fuxing.
storage.set(AUTH_KEY, JSON.stringify(nextYongji));
window.dispatchEvent(new CustomEvent("shitu:auth-synced", {
  detail: { authorizationChanged: true, safeReloadRequested: false },
}));
await delay(20);
assert.equal(state.settings.reservationBuffer, 7, "Yongji state was not loaded after the authorization transition");
const recoveryAfterMove = JSON.parse(storage.get(RECOVERY_KEY) || "null");
assert.equal(recoveryAfterMove?.drafts?.["recovery-user:fuxing"]?.modules?.settings?.reservationBuffer, 9, "Yongji refresh deleted or re-scoped the Fuxing recovery draft");
assert.equal(recoveryAfterMove?.drafts?.["recovery-user:yongji"], undefined, "Fuxing recovery data leaked into the Yongji identity");

// Returning to Fuxing and then revoking edit permission at the same site must capture the latest dirty state again.
const fuxingAgain = { ...initialSession };
storage.set(AUTH_KEY, JSON.stringify(fuxingAgain));
window.dispatchEvent(new CustomEvent("shitu:auth-synced", {
  detail: { authorizationChanged: true, safeReloadRequested: false },
}));
await delay(20);
assert.equal(state.settings.reservationBuffer, 3, "Fuxing baseline did not reload before permission-revocation case");
state = { ...state, settings: { ...state.settings, reservationBuffer: 11 } };
subscriber();
const revoked = {
  ...fuxingAgain,
  permissions: {
    settings: { view: true, edit: false },
    reservations: { view: true, edit: false },
  },
};
window.dispatchEvent(new CustomEvent("shitu:auth-transition-preparing", {
  detail: {
    authorizationChanged: true,
    previous: fuxingAgain,
    next: revoked,
  },
}));
const recoveryAfterRevoke = JSON.parse(storage.get(RECOVERY_KEY) || "null");
assert.equal(recoveryAfterRevoke?.drafts?.["recovery-user:fuxing"]?.modules?.settings?.reservationBuffer, 11, "same-site permission revocation did not refresh the recovery draft with the latest dirty edit");

// A non-authorization profile update must not generate or replace a recovery draft.
const beforeMetadataOnly = storage.get(RECOVERY_KEY);
window.dispatchEvent(new CustomEvent("shitu:auth-transition-preparing", {
  detail: {
    authorizationChanged: false,
    previous: fuxingAgain,
    next: { ...fuxingAgain, name: "Renamed User" },
  },
}));
assert.equal(storage.get(RECOVERY_KEY), beforeMetadataOnly, "metadata-only profile update changed authorization recovery state");

detach();
console.log("BUSINESS_STATE_AUTH_RECOVERY_OK");
