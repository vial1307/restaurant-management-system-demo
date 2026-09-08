import assert from "node:assert/strict";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const STORAGE_KEY = "shitu-kitchen-os-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const CLOUD_SCHEMA_VERSION_KEY = "shitu-inventory-cloud-schema-version";

const date = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
})();

const session = {
  id: "auth-grace-manager",
  username: "managerfx",
  role: "manager",
  accountRole: "manager",
  location: "fuxing",
  permissions: { inventory: { view: true, edit: true } },
};

const storage = new Map([
  [AUTH_KEY, JSON.stringify(session)],
  [CLOUD_FLAG_KEY, "ready"],
  [CLOUD_SCHEMA_VERSION_KEY, "11"],
  [STORAGE_KEY, JSON.stringify({
    version: 1,
    selectedDate: date,
    settings: {},
    records: {
      [date]: {
        date,
        inventory: [],
        workInventory: [],
        reservation: { lunchTables: 0, dinnerTables: 0, remaining: {} },
        riceRemaining: 0,
        procurement: { planned: {}, incoming: {}, orderDates: {} },
        completedTasks: {},
        customTasks: [],
      },
    },
    operations: {},
  })],
]);

const previous = new Map(
  ["localStorage", "window", "document", "navigator", "CustomEvent", "fetch"]
    .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
);

let retryCallback = null;
let retryDelay = null;
const retryTimerId = 91001;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

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
    setTimeout(callback, ms) {
      if (Number(ms) >= 5000 && Number(ms) < 10000) {
        retryCallback = callback;
        retryDelay = Number(ms);
        return retryTimerId;
      }
      return realSetTimeout(callback, ms);
    },
    clearTimeout(id) {
      if (id === retryTimerId) {
        retryCallback = null;
        return;
      }
      realClearTimeout(id);
    },
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

let inventoryGets = 0;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async (path, options = {}) => {
    const url = String(path);
    const method = String(options.method || "GET").toUpperCase();
    if (url === "/api/auth/login" && method === "POST") {
      return new Response(JSON.stringify({ user: session }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "/api/inventory/schema-version") {
      return new Response(JSON.stringify({ version: 11 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "/api/inventory/fuxing") {
      inventoryGets += 1;
      if (inventoryGets === 1) {
        return new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        locations: [{ id: "loc-freezer", code: "fuxing-large-freezer", site: "fuxing", kind: "storage" }],
        items: [{ id: "item-tofu", item_key: "fuxing:tofu", catalog_key: "tofu", name_zh_tw: "豆乾", name_vi: "Đậu khô", unit: "盒", work_area: "noodles", storage_only: false }],
        stock: [{ item_id: "item-tofu", location_id: "loc-freezer", quantity: 7, minimum_quantity: 2 }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("/api/inventory/receive-defaults")) {
      return new Response(JSON.stringify({ defaults: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  },
});

function restore(name) {
  const descriptor = previous.get(name);
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}
const delay = (ms = 0) => new Promise((resolve) => realSetTimeout(resolve, ms));

try {
  const { vpsLogin } = await import("../src/vps-api.js");
  await vpsLogin("managerfx", "KitchenTest!123");
  // The bridge owns the local session in production; keep it present after the login API call.
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));

  const { syncInventoryNow } = await import(`../src/inventory-cloud.js?auth-grace-retry=${Date.now()}`);
  const first = await syncInventoryNow("fuxing");
  assert.equal(first, false, "the initial AUTH_REQUIRED sync should not claim a successful local change");
  assert.equal(inventoryGets, 1, "initial inventory request count mismatch");
  assert.equal(typeof retryCallback, "function", "AUTH_REQUIRED during login grace must schedule one bounded inventory retry");
  assert(retryDelay >= 5000 && retryDelay < 10000, `unexpected auth retry delay ${retryDelay}`);
  assert(localStorage.getItem(AUTH_KEY), "login-grace AUTH_REQUIRED must not clear the current local session immediately");

  document.documentElement.dataset.vpsAuthReady = "true";
  const callback = retryCallback;
  retryCallback = null;
  callback();
  for (let attempt = 0; attempt < 40 && inventoryGets < 2; attempt += 1) await delay(2);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (state.records[date].inventory.length) break;
    await delay(2);
  }

  assert.equal(inventoryGets, 2, "scheduled auth-grace retry did not issue a second inventory GET");
  const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(state.records[date].inventory.length, 1, "successful retry did not apply the authoritative branch snapshot");
  assert.equal(state.records[date].inventory[0].quantity, 7, "retried branch snapshot quantity mismatch");

  console.log("INVENTORY_AUTH_GRACE_RETRY_OK");
} finally {
  for (const name of previous.keys()) restore(name);
}
