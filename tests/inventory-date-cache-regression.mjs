import assert from "node:assert/strict";

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
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

try {
  const { isCurrentBranchInventoryDate } = await import(
    `../src/inventory-cloud.js?inventory-date-cache-regression=${Date.now()}`
  );

  assert.equal(
    isCurrentBranchInventoryDate(),
    true,
    "a fresh browser without persisted UI cache must default inventory permissions to today's service date",
  );

  storage.setItem("餐廳管理系統", JSON.stringify({ selectedDate: "2000-01-01" }));
  assert.equal(
    isCurrentBranchInventoryDate(),
    false,
    "an explicitly persisted historical service date must remain read-only",
  );
} finally {
  if (previousLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
}
