import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseSource = fs.readFileSync(path.join(__dirname, "api-regression.mjs"), "utf8");
const passwordMatch = baseSource.match(/const PASSWORD = "([^"]+)";/);
assert(passwordMatch, "test fixture password not found in api-regression.mjs");
const PASSWORD = passwordMatch[1];
const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";

async function request(pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function login(username) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { username, password: PASSWORD },
  });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  return result.cookie;
}

const employee = await login("employeefx");
const supervisor = await login("supervisorfx");
const central = await login("centralreg");
const admin = await login("yangchuadmin");

const before = await request("/api/inventory/fuxing", { cookie: admin });
assert.equal(before.response.status, 200);
const beef = before.data.items.find((item) => item.catalog_key === "beef");
const freezer = before.data.locations.find((location) => location.code === "fuxing-freezer");
assert(beef && freezer, "fuxing beef/freezer fixture missing");

const supervisorQuantity = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: supervisor,
  body: { itemId: beef.id, locationId: freezer.id, quantity: 13 },
});
assert.equal(supervisorQuantity.response.status, 200);
const supervisorMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: supervisor,
  body: { itemId: beef.id, locationId: freezer.id, minimum: 5 },
});
assert.equal(supervisorMinimum.response.status, 200);

const seeded = await request("/api/inventory/fuxing", { cookie: admin });
const locations = seeded.data.stock
  .filter((row) => row.item_id === beef.id)
  .map((row) => {
    const location = seeded.data.locations.find((candidate) => candidate.id === row.location_id);
    return {
      code: location.code,
      quantity: row.location_id === freezer.id ? 999 : Number(row.quantity),
      minimum: row.location_id === freezer.id ? 999 : Number(row.minimum_quantity),
    };
  });
assert(locations.some((entry) => entry.code === freezer.code));

const catalogEdit = await request("/api/inventory/catalog/sync", {
  method: "POST",
  cookie: employee,
  body: {
    item: {
      key: beef.item_key,
      catalog_key: beef.catalog_key,
      zh: beef.name_zh_tw,
      vi: beef.name_vi,
      unit: beef.unit,
      work_area: beef.work_area,
      storage_only: beef.storage_only,
      locations,
    },
  },
});
assert.equal(catalogEdit.response.status, 200, `catalog metadata edit should remain allowed: ${JSON.stringify(catalogEdit.data)}`);

const after = await request("/api/inventory/fuxing", { cookie: admin });
assert.equal(after.response.status, 200);
const protectedStock = after.data.stock.find((row) => row.item_id === beef.id && row.location_id === freezer.id);
assert(protectedStock, "protected beef stock row missing after catalog sync");
assert.equal(Number(protectedStock.quantity), 13, "catalog sync bypassed stocktake quantity permission");
assert.equal(Number(protectedStock.minimum_quantity), 5, "catalog sync bypassed stocktake minimum permission");

// Central-kitchen accounts keep inventory/catalog operational access, but they
// are not a stocktake role. Seed one Central row as admin, prove direct stocktake
// endpoints reject the Central role, then prove Central catalog sync cannot
// overwrite the seeded quantity/minimum either.
const centralBefore = await request("/api/inventory/central", { cookie: admin });
assert.equal(centralBefore.response.status, 200);
const centralItem = centralBefore.data.items.find((item) => item.catalog_key === "save-button-central")
  || centralBefore.data.items[0];
const centralFreezer = centralBefore.data.locations.find((location) => location.code === "central-freezer");
assert(centralItem && centralFreezer, "central item/freezer fixture missing");

const adminCentralQuantity = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: admin,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, quantity: 17 },
});
assert.equal(adminCentralQuantity.response.status, 200);
const adminCentralMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: admin,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, minimum: 6 },
});
assert.equal(adminCentralMinimum.response.status, 200);

const centralDirectQuantity = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: central,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, quantity: 999 },
});
assert.equal(centralDirectQuantity.response.status, 403, "central role unexpectedly received direct quantity stocktake authority");
assert.equal(centralDirectQuantity.data?.error, "STOCKTAKE_ROLE_REQUIRED");

const centralDirectMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: central,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, minimum: 999 },
});
assert.equal(centralDirectMinimum.response.status, 403, "central role unexpectedly received minimum stocktake authority");
assert.equal(centralDirectMinimum.data?.error, "STOCKTAKE_ROLE_REQUIRED");

const centralSeeded = await request("/api/inventory/central", { cookie: admin });
assert.equal(centralSeeded.response.status, 200);
const centralLocations = centralSeeded.data.stock
  .filter((row) => row.item_id === centralItem.id)
  .map((row) => {
    const location = centralSeeded.data.locations.find((candidate) => candidate.id === row.location_id);
    return {
      code: location.code,
      quantity: row.location_id === centralFreezer.id ? 999 : Number(row.quantity),
      minimum: row.location_id === centralFreezer.id ? 999 : Number(row.minimum_quantity),
    };
  });
assert(centralLocations.some((entry) => entry.code === centralFreezer.code), "central protected stock row missing before catalog sync");

const centralCatalogEdit = await request("/api/inventory/catalog/sync", {
  method: "POST",
  cookie: central,
  body: {
    item: {
      key: centralItem.item_key,
      catalog_key: centralItem.catalog_key,
      zh: centralItem.name_zh_tw,
      vi: centralItem.name_vi,
      unit: centralItem.unit,
      work_area: centralItem.work_area,
      storage_only: centralItem.storage_only,
      locations: centralLocations,
    },
  },
});
assert.equal(centralCatalogEdit.response.status, 200, `central catalog metadata edit should remain allowed: ${JSON.stringify(centralCatalogEdit.data)}`);

const centralAfter = await request("/api/inventory/central", { cookie: admin });
assert.equal(centralAfter.response.status, 200);
const protectedCentralStock = centralAfter.data.stock.find(
  (row) => row.item_id === centralItem.id && row.location_id === centralFreezer.id
);
assert(protectedCentralStock, "protected central stock row missing after catalog sync");
assert.equal(Number(protectedCentralStock.quantity), 17, "central catalog sync bypassed stocktake quantity permission");
assert.equal(Number(protectedCentralStock.minimum_quantity), 6, "central catalog sync bypassed stocktake minimum permission");

console.log("catalog stocktake API regression passed");
