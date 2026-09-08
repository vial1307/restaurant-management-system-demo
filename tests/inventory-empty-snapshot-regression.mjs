import assert from "node:assert/strict";
import { STORAGE_KEY } from "../src/store-core.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const CLOUD_SCHEMA_VERSION_KEY = "shitu-inventory-cloud-schema-version";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CENTRAL_WORK_KEY = "shitu-central-kitchen-work-v1";

const date = new Date();
const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const staleBranchRecord = {
  inventory: [{ id: "stale-large-freezer", stockKey: "stale", label: "舊資料", zone: "large-freezer", quantity: 7 }],
  workInventory: [{ id: "work-stale", stockKey: "stale", label: "舊工作區", workArea: "noodles", quantity: 3 }],
};

const storage = new Map([
  [AUTH_KEY, JSON.stringify({
    id: "empty-snapshot-admin",
    role: "admin",
    accountRole: "admin",
    location: "all",
    permissions: { inventory: { view: true, edit: true } },
  })],
  [CLOUD_FLAG_KEY, "ready"],
  [CLOUD_SCHEMA_VERSION_KEY, "11"],
  [ACTIVE_SITE_KEY, "fuxing"],
  [STORAGE_KEY, JSON.stringify({ selectedDate: today, records: { [today]: structuredClone(staleBranchRecord) } })],
  [CENTRAL_KEY, JSON.stringify([{ id: "stale@central-freezer", zh: "舊央廚", zone: "央廚冷凍", qty: 9 }])],
  [CENTRAL_WORK_KEY, JSON.stringify({ "central:stale": { quantity: 4, minimum: 1 } })],
]);

const previous = new Map(
  ["localStorage", "window", "document", "navigator", "CustomEvent", "fetch"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: { hostname: "82.47.180.185", protocol: "http:" },
    addEventListener() {},
    dispatchEvent() { return true; },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
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
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
class TestCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}
Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: TestCustomEvent });

let centralMalformed = true;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async (path, options = {}) => {
    const url = String(path);
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") throw new Error(`Unexpected mutation: ${method} ${url}`);
    if (url === "/api/inventory/schema-version") {
      return new Response(JSON.stringify({ version: 11 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "/api/inventory/fuxing") {
      return new Response(JSON.stringify({ locations: [], stock: [], items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "/api/inventory/central") {
      const payload = centralMalformed ? { items: [] } : { locations: [], stock: [], items: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  },
});

function restore(name) {
  const descriptor = previous.get(name);
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

try {
  const cloud = await import(`../src/inventory-cloud.js?empty-snapshot=${Date.now()}`);
  const api = await import("../src/vps-api.js");

  await cloud.syncInventoryNow("fuxing");
  const branchState = JSON.parse(storage.get(STORAGE_KEY));
  assert.deepEqual(branchState.records[today].inventory, [], "authoritative empty branch snapshot did not clear stale storage inventory");
  assert.deepEqual(branchState.records[today].workInventory, [], "authoritative empty branch snapshot did not clear stale work inventory");

  const centralBeforeMalformed = storage.get(CENTRAL_KEY);
  const centralWorkBeforeMalformed = storage.get(CENTRAL_WORK_KEY);
  const malformedResult = await cloud.syncInventoryNow("central");
  assert.equal(malformedResult, false, "malformed inventory payload should fail synchronization");
  assert.equal(storage.get(CENTRAL_KEY), centralBeforeMalformed, "malformed payload cleared central storage mirror");
  assert.equal(storage.get(CENTRAL_WORK_KEY), centralWorkBeforeMalformed, "malformed payload cleared central work mirror");

  centralMalformed = false;
  api.invalidateVpsInventoryCache("central");
  await cloud.syncInventoryNow("central");
  assert.deepEqual(JSON.parse(storage.get(CENTRAL_KEY)), [], "authoritative empty central snapshot did not clear stale storage mirror");
  assert.deepEqual(JSON.parse(storage.get(CENTRAL_WORK_KEY)), {}, "authoritative empty central snapshot did not clear stale work mirror");

  console.log("INVENTORY_EMPTY_SNAPSHOT_AUTHORITY_OK");
} finally {
  for (const name of previous.keys()) restore(name);
}
