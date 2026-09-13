import { createStore as createCoreStore, STORAGE_KEY } from "./store-core.js";
import { createMicrotaskCoalescedListener } from "./render-coalescer.js";

export * from "./store-core.js";

const UI_RENDER_LISTENER_NAME = "renderWhenAuthorized";
const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const BRANCH_CACHE_KEY = "shitu-inventory-branch-snapshots-v1";
const BRANCH_SITES = new Set(["fuxing", "yongji"]);

function appShellIdentity() {
  return globalThis.document?.querySelector?.("#app")?.firstElementChild ?? null;
}

function readJson(storage, key, fallback = null) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function effectiveInventorySite(storage) {
  const session = readJson(storage, AUTH_KEY, null);
  const location = String(session?.location || "");
  if (BRANCH_SITES.has(location)) return location;
  if (location === "central") return "central";
  const saved = String(storage?.getItem?.(ACTIVE_SITE_KEY) || "");
  return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
}

function readBranchCache(storage) {
  const value = readJson(storage, BRANCH_CACHE_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeBranchCache(storage, cache) {
  storage?.setItem?.(BRANCH_CACHE_KEY, JSON.stringify(cache));
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function snapshotFromPersistedState(storage, site) {
  if (!BRANCH_SITES.has(site)) return null;
  const persisted = readJson(storage, STORAGE_KEY, null);
  const date = String(persisted?.selectedDate || "");
  const record = date ? persisted?.records?.[date] : null;
  if (!record || !Array.isArray(record.inventory) || !Array.isArray(record.workInventory)) return null;
  return {
    site,
    date,
    inventory:clone(record.inventory),
    workInventory:clone(record.workInventory),
    updatedAt:new Date().toISOString(),
  };
}

function attachInventorySiteParity(core, storage) {
  if (!globalThis.window?.addEventListener) return;

  const applySnapshot = (site, snapshot = null) => {
    if (!BRANCH_SITES.has(site)) return;
    const state = core.getState();
    const date = String(state?.selectedDate || "");
    if (!date) return;
    const usable = snapshot?.site === site && snapshot?.date === date ? snapshot : null;
    const record = state?.records?.[date];
    if (record?.inventorySite === site && (!usable || (
      JSON.stringify(record.inventory || []) === JSON.stringify(usable.inventory || [])
      && JSON.stringify(record.workInventory || []) === JSON.stringify(usable.workInventory || [])
    ))) return;

    core.update((draft) => {
      const target = draft.records?.[draft.selectedDate];
      if (!target) return;
      target.inventory = clone(usable?.inventory || []);
      target.workInventory = clone(usable?.workInventory || []);
      target.inventorySite = site;
      target.inventorySnapshotUpdatedAt = usable?.updatedAt || null;
    });
  };

  const reconcileTargetSite = (site = effectiveInventorySite(storage)) => {
    if (!BRANCH_SITES.has(site)) return;
    const cache = readBranchCache(storage);
    applySnapshot(site, cache?.[site] || null);
  };

  window.addEventListener("shitu:inventory-cloud-updated", (event) => {
    const site = String(event?.detail?.site || "");
    if (!BRANCH_SITES.has(site)) return;
    const snapshot = snapshotFromPersistedState(storage, site);
    if (!snapshot) return;
    const cache = readBranchCache(storage);
    cache[site] = snapshot;
    writeBranchCache(storage, cache);
    if (effectiveInventorySite(storage) === site) applySnapshot(site, snapshot);
  });

  window.addEventListener("shitu:active-site-changed", (event) => {
    const site = String(event?.detail?.site || effectiveInventorySite(storage));
    reconcileTargetSite(site);
  });

  window.addEventListener("shitu:auth-synced", () => {
    reconcileTargetSite();
  });

  // On a cold start, never let a branch record without a matching site identity
  // survive into the first authenticated render. Cached target-site data can be
  // used immediately; otherwise the record is cleared until VPS sync completes.
  if (globalThis.document?.documentElement?.dataset?.vpsAuthReady === "true") {
    reconcileTargetSite();
  }
}

export function createStore(storage = globalThis.localStorage) {
  const core = createCoreStore(storage);
  const subscribeCore = core.subscribe.bind(core);
  attachInventorySiteParity(core, storage);

  return {
    ...core,
    subscribe(listener) {
      if (listener?.name !== UI_RENDER_LISTENER_NAME) return subscribeCore(listener);

      const coalesced = createMicrotaskCoalescedListener(listener, {
        capture: appShellIdentity,
        shouldRun: (queuedShell) => appShellIdentity() === queuedShell,
      });
      const unsubscribe = subscribeCore(coalesced);
      return () => {
        unsubscribe();
        coalesced.cancel();
      };
    },
  };
}
