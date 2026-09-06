function scheduleMicrotask(callback) {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

let tokenSequence = 0;
let activeToken = 0;
let clearQueued = false;

export function markSearchEvaluation() {
  if (!activeToken) activeToken = ++tokenSequence;
  if (!clearQueued) {
    clearQueued = true;
    scheduleMicrotask(() => {
      activeToken = 0;
      clearQueued = false;
    });
  }
  return activeToken;
}

export function currentSearchEvaluationToken() {
  return activeToken;
}