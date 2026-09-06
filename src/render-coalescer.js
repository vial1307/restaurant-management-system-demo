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
  const capture = typeof scheduler.capture === "function" ? scheduler.capture : () => undefined;
  const shouldRun = typeof scheduler.shouldRun === "function" ? scheduler.shouldRun : () => true;
  let queued = false;
  let active = true;
  let latestArgs = [];
  let queuedCapture;

  const wrapped = (...args) => {
    if (!active) return;
    latestArgs = args;
    if (queued) return;
    queued = true;
    queuedCapture = capture();
    schedule(() => {
      queued = false;
      const captured = queuedCapture;
      queuedCapture = undefined;
      if (!active || !shouldRun(captured)) return;
      listener(...latestArgs);
    });
  };

  wrapped.cancel = () => {
    active = false;
    queued = false;
    queuedCapture = undefined;
    latestArgs = [];
  };

  return wrapped;
}