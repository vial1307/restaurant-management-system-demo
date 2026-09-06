import { createStore as createCoreStore } from "./store-core.js";
import { createMicrotaskCoalescedListener } from "./render-coalescer.js";

export * from "./store-core.js";

const UI_RENDER_LISTENER_NAME = "renderWhenAuthorized";

export function createStore(storage = globalThis.localStorage) {
  const core = createCoreStore(storage);
  const subscribeCore = core.subscribe.bind(core);

  return {
    ...core,
    subscribe(listener) {
      if (listener?.name !== UI_RENDER_LISTENER_NAME) return subscribeCore(listener);

      const coalesced = createMicrotaskCoalescedListener(listener);
      const unsubscribe = subscribeCore(coalesced);
      return () => {
        unsubscribe();
        coalesced.cancel();
      };
    },
  };
}
