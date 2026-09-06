function defaultSchedule(callback) {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

export function createMicrotaskCoalescedListener(listener, scheduler = {}) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  const schedule = scheduler.schedule || defaultSchedule;
  let queued = false;
  let active = true;
  let latestArgs = [];

  const wrapped = (...args) => {
    if (!active) return;
    latestArgs = args;
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      if (!active) return;
      listener(...latestArgs);
    });
  };

  wrapped.cancel = () => {
    active = false;
    queued = false;
    latestArgs = [];
  };

  return wrapped;
}
