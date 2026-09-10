import assert from "node:assert/strict";
import { STORAGE_KEY } from "../src/store-core.js";
import { normalizePersistedServiceDate } from "../src/store.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  let writes = 0;
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes += 1; data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    get writes() { return writes; },
  };
}

const today = "2026-09-11";
const stale = {
  version: 1,
  selectedDate: "2026-09-09",
  records: {
    "2026-09-09": { marker: "historical" },
    "2026-09-11": { marker: "current" },
  },
};
const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(stale) });
assert.equal(normalizePersistedServiceDate(storage, today), true, "stale persisted service date must reset on a fresh browser session");
const normalized = JSON.parse(storage.getItem(STORAGE_KEY));
assert.equal(normalized.selectedDate, today, "browser startup must point at today's service date");
assert.equal(normalized.records["2026-09-09"].marker, "historical", "historical records must not be deleted while resetting the startup date");
assert.equal(normalized.records["2026-09-11"].marker, "current", "current authoritative mirror must be preserved");
assert.equal(storage.writes, 1, "date normalization should make a single local mirror write");

assert.equal(normalizePersistedServiceDate(storage, today), false, "already-current startup date must be a no-op");
assert.equal(storage.writes, 1, "no-op normalization must not rewrite localStorage");

const malformed = memoryStorage({ [STORAGE_KEY]: "{bad-json" });
assert.doesNotThrow(() => normalizePersistedServiceDate(malformed, today));
assert.equal(normalizePersistedServiceDate(malformed, today), false, "malformed legacy cache must not block application startup");

console.log("INVENTORY_STARTUP_CURRENT_DATE_OK");
