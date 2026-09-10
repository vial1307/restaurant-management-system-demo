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
  return { cookie: result.cookie, user: result.data.user };
}

const employee = await login("employeefx");
const parttime = await login("parttimefx");
const central = await login("centralreg");
const admin = await login("yangchuadmin");

assert.equal(Boolean(employee.user.permissions?.inventory?.edit), true, "employee fixture must carry explicit inventory.edit");
assert.equal(Boolean(parttime.user.permissions?.inventory?.edit), false, "part-time fixture must not carry inventory.edit");
assert.equal(Boolean(central.user.permissions?.inventory?.edit), true, "central fixture must carry explicit inventory.edit");

const before = await request("/api/inventory/fuxing", { cookie: admin.cookie });
assert.equal(before.response.status, 200);
const beef = before.data.items.find((item) => item.catalog_key === "beef");
const freezer = before.data.locations.find((location) => location.code === "fuxing-freezer");
const workNoodles = before.data.locations.find((location) => location.code === "fuxing-work-noodles");
assert(beef && freezer && workNoodles, "fuxing beef/freezer/work fixture missing");

// A scoped employee with inventory.edit receives the same quantity/minimum
// mutation authority as other editors. Role name is not an extra gate.
const employeeQuantity = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: employee.cookie,
  body: { itemId: beef.id, locationId: freezer.id, quantity: 31 },
});
assert.equal(employeeQuantity.response.status, 200);
assert.equal(Number(employeeQuantity.data.after), 31);

const employeeMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: employee.cookie,
  body: { itemId: beef.id, locationId: freezer.id, minimum: 8 },
});
assert.equal(employeeMinimum.response.status, 200);

const employeeWorkMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: employee.cookie,
  body: { itemId: beef.id, locationId: workNoodles.id, minimum: 9 },
});
assert.equal(employeeWorkMinimum.response.status, 200);

// The same endpoints remain server-protected for an account without edit.
for (const [pathname, body] of [
  ["/api/inventory/set-quantity", { itemId: beef.id, locationId: freezer.id, quantity: 999 }],
  ["/api/inventory/set-minimum", { itemId: beef.id, locationId: freezer.id, minimum: 999 }],
]) {
  const denied = await request(pathname, { method: "POST", cookie: parttime.cookie, body });
  assert.equal(denied.response.status, 403, `part-time mutation was accepted by ${pathname}`);
  assert.equal(denied.data?.error, "INVENTORY_EDIT_NOT_ALLOWED");
}

// Catalogue save must obey the same effective permission instead of silently
// treating quantity fields differently by role. Build the payload from the
// current snapshot so unrelated configured locations are retained.
const seeded = await request("/api/inventory/fuxing", { cookie: admin.cookie });
const employeeCatalogLocations = seeded.data.stock
  .filter((row) => row.item_id === beef.id)
  .map((row) => {
    const location = seeded.data.locations.find((candidate) => candidate.id === row.location_id);
    return {
      code: location.code,
      quantity: row.location_id === freezer.id ? 32 : Number(row.quantity),
      minimum: row.location_id === freezer.id ? 10 : Number(row.minimum_quantity),
    };
  });
const employeeCatalogEdit = await request("/api/inventory/catalog/sync", {
  method: "POST",
  cookie: employee.cookie,
  body: {
    item: {
      key: beef.item_key,
      catalog_key: beef.catalog_key,
      zh: beef.name_zh_tw,
      vi: beef.name_vi,
      unit: beef.unit,
      work_area: beef.work_area,
      storage_only: beef.storage_only,
      locations: employeeCatalogLocations,
    },
  },
});
assert.equal(employeeCatalogEdit.response.status, 200, `employee catalog save denied despite inventory.edit: ${JSON.stringify(employeeCatalogEdit.data)}`);

const afterEmployeeCatalog = await request("/api/inventory/fuxing", { cookie: admin.cookie });
const employeeCatalogStock = afterEmployeeCatalog.data.stock.find(
  (row) => row.item_id === beef.id && row.location_id === freezer.id
);
assert.equal(Number(employeeCatalogStock?.quantity), 32, "employee inventory editor did not persist quantity under inventory.edit");
assert.equal(Number(employeeCatalogStock?.minimum_quantity), 10, "employee inventory editor did not persist minimum under inventory.edit");

const deniedCatalog = await request("/api/inventory/catalog/sync", {
  method: "POST",
  cookie: parttime.cookie,
  body: {
    item: {
      key: beef.item_key,
      catalog_key: beef.catalog_key,
      zh: beef.name_zh_tw,
      vi: beef.name_vi,
      unit: beef.unit,
      work_area: beef.work_area,
      storage_only: beef.storage_only,
      locations: employeeCatalogLocations,
    },
  },
});
assert.equal(deniedCatalog.response.status, 403, "part-time catalog mutation unexpectedly allowed");
assert.equal(deniedCatalog.data?.error, "INVENTORY_EDIT_NOT_ALLOWED");

// Central staff are scoped to Central and, when explicitly granted edit,
// receive the same operational quantity/minimum controls for that site.
const centralBefore = await request("/api/inventory/central", { cookie: admin.cookie });
assert.equal(centralBefore.response.status, 200);
const centralItem = centralBefore.data.items.find((item) => item.catalog_key === "save-button-central")
  || centralBefore.data.items[0];
const centralFreezer = centralBefore.data.locations.find((location) => location.code === "central-freezer");
assert(centralItem && centralFreezer, "central item/freezer fixture missing");

const centralQuantity = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: central.cookie,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, quantity: 21 },
});
assert.equal(centralQuantity.response.status, 200);
assert.equal(Number(centralQuantity.data.after), 21);

const centralMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: central.cookie,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, minimum: 7 },
});
assert.equal(centralMinimum.response.status, 200);

// Site scope is still enforced even when inventory.edit is true.
const wrongSite = await request("/api/inventory/set-quantity", {
  method: "POST",
  cookie: employee.cookie,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, quantity: 77 },
});
assert.equal(wrongSite.response.status, 403, "employee edit permission escaped assigned site scope");
assert.equal(wrongSite.data?.error, "INVENTORY_EDIT_NOT_ALLOWED");

console.log("permission-driven inventory edit API regression passed");
