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

console.log("catalog stocktake API regression passed");
