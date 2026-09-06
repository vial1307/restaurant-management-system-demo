function defaultSchedule(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return { kind: "raf", id: globalThis.requestAnimationFrame(callback) };
  }
  return { kind: "timeout", id: globalThis.setTimeout(callback, 0) };
}

function defaultCancel(ticket) {
  if (!ticket) return;
  if (ticket.kind === "raf" && typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(ticket.id);
    return;
  }
  globalThis.clearTimeout?.(ticket.id);
}

export function createFrameCoalescedListener(listener, scheduler = {}) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  const schedule = scheduler.schedule || defaultSchedule;
  const cancel = scheduler.cancel || defaultCancel;
  let queued = null;
  let active = true;
  let latestArgs = [];

  const wrapped = (...args) => {
    if (!active) return;
    latestArgs = args;
    if (queued) return;
    queued = schedule(() => {
      queued = null;
      if (!active) return;
      listener(...latestArgs);
    });
  };

  wrapped.cancel = () => {
    active = false;
    if (queued) cancel(queued);
    queued = null;
    latestArgs = [];
  };

  return wrapped;
}
