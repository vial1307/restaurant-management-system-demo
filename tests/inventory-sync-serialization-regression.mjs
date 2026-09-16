import assert from "node:assert/strict";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const CLOUD_SCHEMA_VERSION_KEY = "shitu-inventory-cloud-schema-version";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";

const storage = new Map([
  [AUTH_KEY, JSON.stringify({
    id: "sync-admin",
    role: "admin",
    accountRole: "admin",
    location: "all",
    permissions: { inventory: { view: true, edit: true } },
  })],
  [CLOUD_FLAG_KEY, "ready"],
  [CLOUD_SCHEMA_VERSION_KEY, "12"],
  [ACTIVE_SITE_KEY, "fuxing"],
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
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { onLine: true },
});
class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: TestCustomEvent });

let releaseFuxing;
let fuxingStarted = false;
const inventoryRequests = [];
const emptyInventory = () => ({ locations: [], stock: [], items: [] });
const sites = [
  { code: "central", name_vi: "Bếp trung tâm", name_zh_tw: "央廚", sort_order: 10, metadata: { inventory_mode: "central" } },
  { code: "fuxing", name_vi: "Fuxing", name_zh_tw: "復興店", sort_order: 20, metadata: { inventory_mode: "branch" } },
  { code: "yongji", name_vi: "Yongji", name_zh_tw: "永吉店", sort_order: 30, metadata: { inventory_mode: "branch" } },
];
function masterData(site) {
  return {
    site: sites.find((entry) => entry.code === site),
    locations: [
      { code: `${site}-large-freezer`, site, kind: "storage", sort_order: 10, active: true, name_zh_tw: "大冷凍", name_vi: "Tủ đông lớn", metadata: { ui_key: "large-freezer", storage_group: "primary" } },
      { code: `${site}-work-noodles`, site, kind: "work", sort_order: 100, active: true, name_zh_tw: "麵區", name_vi: "Khu mì", metadata: { ui_key: "noodles", work_area: "noodles" } },
    ],
    workAreas: [
      { code: "noodles", site_code: site, name_zh_tw: "麵區", name_vi: "Khu mì", sort_order: 10, active: true, metadata: {} },
    ],
  };
}

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async (path, options = {}) => {
    const url = String(path);
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET") throw new Error(`Unexpected mutation in sync regression: ${method} ${url}`);
    if (url === "/api/inventory/schema-version") {
      return new Response(JSON.stringify({ version: 12 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "/api/inventory/sites") {
      return new Response(JSON.stringify({ sites }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const masterMatch = url.match(/^\/api\/master-data\/(fuxing|yongji)$/);
    if (masterMatch) {
      return new Response(JSON.stringify(masterData(masterMatch[1])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const match = url.match(/^\/api\/inventory\/(fuxing|yongji)$/);
    if (!match) throw new Error(`Unexpected request: ${method} ${url}`);
    const site = match[1];
    inventoryRequests.push(site);
    if (site === "fuxing" && !fuxingStarted) {
      fuxingStarted = true;
      await new Promise((resolve) => { releaseFuxing = resolve; });
    }
    return new Response(JSON.stringify(emptyInventory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
function restore(name) {
  const descriptor = previous.get(name);
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

try {
  const { syncInventoryNow } = await import(`../src/inventory-cloud.js?sync-serialization=${Date.now()}`);

  const first = syncInventoryNow("fuxing");
  for (let attempt = 0; attempt < 30 && typeof releaseFuxing !== "function"; attempt += 1) await delay(1);
  assert.equal(typeof releaseFuxing, "function", "first Fuxing sync never entered the held inventory GET");

  let secondSettled = false;
  const second = syncInventoryNow("yongji").then((value) => {
    secondSettled = true;
    return value;
  });

  await delay(5);
  assert.equal(secondSettled, false, "a sync requested while another site was busy was dropped instead of queued");
  assert.deepEqual(inventoryRequests, ["fuxing"], "Yongji sync ran concurrently and raced the shared inventory ID cache");

  releaseFuxing();
  await Promise.all([first, second]);
  assert.deepEqual(inventoryRequests, ["fuxing", "yongji"], "queued cross-site sync did not run after the active sync completed");

  console.log("INVENTORY_SYNC_SERIALIZATION_OK");
} finally {
  for (const name of previous.keys()) restore(name);
}
