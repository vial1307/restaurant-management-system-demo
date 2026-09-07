import { createStore as createCoreStore, STORAGE_KEY } from "./store-core.js";
import { createMicrotaskCoalescedListener } from "./render-coalescer.js";

export * from "./store-core.js";

const UI_RENDER_LISTENER_NAME = "renderWhenAuthorized";

function appShellIdentity() {
  return globalThis.document?.querySelector?.("#app")?.firstElementChild ?? null;
}

export function createStore(storage = globalThis.localStorage) {
  const hadPersistedState = Boolean(storage.getItem(STORAGE_KEY));
  const core = createCoreStore(storage);

  // Some inventory permission/date helpers intentionally consume the persisted
  // UI cache independently from the live store. On a fresh browser there is no
  // cache yet, even though the hydrated store already has today's service date.
  // Mirror only that first hydrated snapshot so all frontend readers start from
  // one coherent state. This is local cache initialization, never VPS success.
  if (!hadPersistedState) storage.setItem(STORAGE_KEY, JSON.stringify(core.getState()));

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