import assert from "node:assert/strict";
import { createStore } from "../src/store.js";

function memoryStorage() {
  const values = new Map();
  let writes = 0;
  return {
    get length() { return values.size; },
    get writes() { return writes; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); writes += 1; },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
  };
}

const originalQueueMicrotask = globalThis.queueMicrotask;
const microtasks = [];
globalThis.queueMicrotask = (callback) => {
  microtasks.push(callback);
};

function flushMicrotasks() {
  const queued = microtasks.splice(0);
  for (const callback of queued) callback();
}

try {
  const storage = memoryStorage();
  const store = createStore(storage);
  let immediateCalls = 0;
  let renderCalls = 0;
  let latestEmployee = "";

  function scheduleSave(state) {
    immediateCalls += 1;
    latestEmployee = state.settings.employeeName;
  }

  function renderWhenAuthorized(state) {
    renderCalls += 1;
    latestEmployee = state.settings.employeeName;
  }

  const unsubscribeImmediate = store.subscribe(scheduleSave);
  const unsubscribeRender = store.subscribe(renderWhenAuthorized);

  store.updateSetting("employeeName", "Render A");
  store.updateSetting("employeeName", "Render B");

  assert.equal(immediateCalls, 2, "non-UI persistence subscribers must observe every mutation synchronously");
  assert.equal(storage.writes, 2, "render batching must not batch local persistence writes");
  assert.equal(renderCalls, 0, "UI rendering must wait only until the microtask checkpoint");
  assert.equal(microtasks.length, 1, "a synchronous mutation burst must queue only one UI microtask");

  flushMicrotasks();
  assert.equal(renderCalls, 1, "a synchronous mutation burst must produce one UI render");
  assert.equal(latestEmployee, "Render B", "coalesced UI render must observe the latest state");

  store.updateSetting("employeeName", "Render C");
  assert.equal(immediateCalls, 3, "later mutations must still notify persistence immediately");
  assert.equal(microtasks.length, 1, "a later mutation must schedule a new UI microtask");
  flushMicrotasks();
  assert.equal(renderCalls, 2, "a later microtask checkpoint must render normally");
  assert.equal(latestEmployee, "Render C", "later UI render must receive the latest state");

  store.updateSetting("employeeName", "Render D");
  assert.equal(microtasks.length, 1, "queued UI microtask missing before unsubscribe test");
  unsubscribeRender();
  flushMicrotasks();
  assert.equal(renderCalls, 2, "an inert queued microtask must not render after unsubscribe");
  assert.equal(immediateCalls, 4, "cancelling UI rendering must not affect persistence subscribers");

  unsubscribeImmediate();
  console.log("RENDER_COALESCING_REGRESSION_OK");
} finally {
  if (originalQueueMicrotask === undefined) delete globalThis.queueMicrotask;
  else globalThis.queueMicrotask = originalQueueMicrotask;
}
