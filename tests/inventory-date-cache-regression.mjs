import assert from "node:assert/strict";
import { STORAGE_KEY } from "../src/store-core.js";

const values = new Map();
const storage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener() {},
    dispatchEvent() { return true; },
    setInterval() { return 0; },
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    documentElement: { dataset: { vpsAuthReady: "false" } },
    visibilityState: "visible",
    addEventListener() {},
    querySelector() { return null; },
  },
});

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

try {
  const { isCurrentBranchInventoryDate } = await import(
    `../src/inventory-cloud.js?inventory-date-cache-regression=${Date.now()}`
  );

  assert.equal(
    isCurrentBranchInventoryDate(),
    true,
    "a fresh browser without persisted UI cache must default inventory permissions to today's service date",
  );

  storage.setItem(STORAGE_KEY, JSON.stringify({ selectedDate: "2000-01-01" }));
  assert.equal(
    isCurrentBranchInventoryDate(),
    false,
    "an explicitly persisted historical service date must remain read-only",
  );
} finally {
  restoreGlobal("localStorage", previousLocalStorage);
  restoreGlobal("window", previousWindow);
  restoreGlobal("document", previousDocument);
}
