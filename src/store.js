import { createStore as createCoreStore, STORAGE_KEY } from "./store-core.js";
import { formatDateKey } from "./rules.js";
import { createMicrotaskCoalescedListener } from "./render-coalescer.js";

export * from "./store-core.js";

const UI_RENDER_LISTENER_NAME = "renderWhenAuthorized";

function appShellIdentity() {
  return globalThis.document?.querySelector?.("#app")?.firstElementChild ?? null;
}

export function normalizePersistedServiceDate(storage, today = formatDateKey()) {
  if (!storage?.getItem || !storage?.setItem || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return false;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.records !== "object") return false;
    if (parsed.selectedDate === today) return false;
    parsed.selectedDate = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function createStore(storage = globalThis.localStorage) {
  // A persisted service date is device-local UI state, not shared inventory state.
  // Reset it only for the real browser store on a fresh page load so every device
  // starts from today's PostgreSQL-backed snapshot. Historical dates selected later
  // in the same SPA session remain available and read-only as before.
  if (typeof globalThis.localStorage !== "undefined" && storage === globalThis.localStorage) {
    normalizePersistedServiceDate(storage);
  }

  const core = createCoreStore(storage);
  const subscribeCore = core.subscribe.bind(core);

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
