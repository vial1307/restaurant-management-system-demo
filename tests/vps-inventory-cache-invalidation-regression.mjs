import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
globalThis.window = {
  location: { hostname: "82.47.180.185", protocol: "http:" },
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  dispatchEvent() {},
};

let inventoryGets = 0;
let failNextMutation = false;
const mutationPosts = [];

globalThis.fetch = async (path, options = {}) => {
  const url = String(path);
  const method = String(options.method || "GET").toUpperCase();
  if (method === "GET" && url === "/api/inventory/fuxing") {
    inventoryGets += 1;
    return new Response(JSON.stringify({ marker: inventoryGets }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (method === "POST" && url.startsWith("/api/inventory/")) {
    mutationPosts.push(url);
    if (failNextMutation) {
      failNextMutation = false;
      return new Response(JSON.stringify({ error: "TEST_MUTATION_FAILED" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

const api = await import(`../src/vps-api.js?inventory-cache-regression=${Date.now()}`);
const {
  vpsAdjustInventory,
  vpsDirectTransfer,
  vpsInventory,
  vpsSetMinimum,
  vpsSetQuantity,
  vpsShipInventory,
  vpsTransferInventory,
} = api;

async function assertSuccessfulMutationInvalidates(label, mutate) {
  const before = await vpsInventory("fuxing");
  const readsBefore = inventoryGets;
  const cached = await vpsInventory("fuxing");
  assert.equal(cached.marker, before.marker, `${label}: cache baseline changed unexpectedly`);
  assert.equal(inventoryGets, readsBefore, `${label}: baseline read did not reuse the inventory cache`);

  await mutate();
  const after = await vpsInventory("fuxing");
  assert.equal(inventoryGets, readsBefore + 1, `${label}: successful mutation did not invalidate inventory cache`);
  assert.notEqual(after.marker, before.marker, `${label}: read-after-write reused stale inventory snapshot`);
}

await assertSuccessfulMutationInvalidates("set quantity", () => vpsSetQuantity({ itemId: "i", locationId: "l", quantity: 2 }));
await assertSuccessfulMutationInvalidates("set minimum", () => vpsSetMinimum({ itemId: "i", locationId: "l", minimum: 1 }));
await assertSuccessfulMutationInvalidates("adjust", () => vpsAdjustInventory({ itemId: "i", locationId: "l", direction: "in", amount: 1 }));
await assertSuccessfulMutationInvalidates("transfer", () => vpsTransferInventory({ itemId: "i", sourceLocationId: "a", destinationLocationId: "b", amount: 1 }));
await assertSuccessfulMutationInvalidates("ship", () => vpsShipInventory({ itemId: "i", sourceLocationId: "a", destinationSite: "yongji", amount: 1 }));
await assertSuccessfulMutationInvalidates("direct transfer", () => vpsDirectTransfer({ sourceSite: "fuxing", destinationSite: "yongji", amount: 1 }));

const cachedBeforeFailure = await vpsInventory("fuxing");
const readsBeforeFailure = inventoryGets;
failNextMutation = true;
await assert.rejects(
  () => vpsSetQuantity({ itemId: "i", locationId: "l", quantity: 9 }),
  (error) => error?.code === "TEST_MUTATION_FAILED"
);
const cachedAfterFailure = await vpsInventory("fuxing");
assert.equal(inventoryGets, readsBeforeFailure, "failed mutation should not discard a still-valid inventory cache");
assert.equal(cachedAfterFailure.marker, cachedBeforeFailure.marker, "failed mutation unexpectedly changed cached inventory state");

assert.deepEqual(
  mutationPosts.slice(0, 6),
  [
    "/api/inventory/set-quantity",
    "/api/inventory/set-minimum",
    "/api/inventory/adjust",
    "/api/inventory/transfer",
    "/api/inventory/ship",
    "/api/inventory/direct-transfer",
  ],
  "inventory mutation coverage drifted"
);

console.log("VPS_INVENTORY_READ_AFTER_WRITE_CACHE_OK");
