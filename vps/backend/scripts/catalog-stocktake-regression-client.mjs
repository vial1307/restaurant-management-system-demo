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
const workNoodles = before.data.locations.find((location) => location.code === "fuxing-work-noodles");
assert(beef && freezer && workNoodles, "fuxing beef/freezer/work fixture missing");

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
const supervisorWorkMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: supervisor,
  body: { itemId: beef.id, locationId: workNoodles.id, minimum: 7 },
});
assert.equal(supervisorWorkMinimum.response.status, 200);

const seeded = await request("/api/inventory/fuxing", { cookie: admin });
const locations = seeded.data.stock
  .filter((row) => row.item_id === beef.id)
  .map((row) => {
    const location = seeded.data.locations.find((candidate) => candidate.id === row.location_id);
    return {
      code: location.code,
      quantity: row.location_id === freezer.id ? 999 : Number(row.quantity),
      minimum: row.location_id === freezer.id || row.location_id === workNoodles.id
        ? 999
        : Number(row.minimum_quantity),
    };
  });
assert(locations.some((entry) => entry.code === freezer.code));
assert(locations.some((entry) => entry.code === workNoodles.code));

// Even a stocktake-capable role must not use catalog sync as a hidden quantity
// write path. Product metadata saves can contain stale local quantities.
const supervisorCatalogEdit = await request("/api/inventory/catalog/sync", {
  method: "POST",
  cookie: supervisor,
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
assert.equal(
  supervisorCatalogEdit.response.status,
  200,
  `stocktake-capable catalog metadata edit should remain allowed: ${JSON.stringify(supervisorCatalogEdit.data)}`
);

const afterSupervisorCatalog = await request("/api/inventory/fuxing", { cookie: admin });
assert.equal(afterSupervisorCatalog.response.status, 200);
const supervisorProtectedStock = afterSupervisorCatalog.data.stock.find(
  (row) => row.item_id === beef.id && row.location_id === freezer.id
);
const supervisorProtectedWorkStock = afterSupervisorCatalog.data.stock.find(
  (row) => row.item_id === beef.id && row.location_id === workNoodles.id
);
assert.equal(Number(supervisorProtectedStock?.quantity), 13, "stocktake-capable catalog sync overwrote quantity");
assert.equal(Number(supervisorProtectedStock?.minimum_quantity), 5, "stocktake-capable catalog sync overwrote minimum");
assert.equal(Number(supervisorProtectedWorkStock?.minimum_quantity), 7, "stocktake-capable catalog sync overwrote work minimum");

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
const protectedWorkStock = after.data.stock.find((row) => row.item_id === beef.id && row.location_id === workNoodles.id);
assert(protectedWorkStock, "protected beef work stock row missing after catalog sync");
assert.equal(Number(protectedWorkStock.minimum_quantity), 7, "catalog sync bypassed work minimum stocktake permission");

// A catalog location association may be removed only after both physical
// quantity and minimum configuration reach zero.
const secondStorage = before.data.locations.find(
  (location) => location.kind === "storage" && location.id !== freezer.id
);
assert(secondStorage, "second Fuxing storage fixture missing");

const protectedItemKey = "fuxing:catalog-location-protection-regression";
const protectedCatalogKey = "catalog-location-protection-regression";
const createProtectedItem = await request("/api/inventory/catalog/sync", {
  method:"POST",
  cookie:admin,
  body:{
    item:{
      key:protectedItemKey,
      catalog_key:protectedCatalogKey,
      zh:"品項儲位保護測試",
      vi:"Kiểm thử bảo vệ vị trí sản phẩm",
      unit:"包",
      work_area:"noodles",
      storage_only:true,
      locations:[
        {code:freezer.code,quantity:999,minimum:999},
        {code:secondStorage.code,quantity:999,minimum:999},
      ],
    },
  },
});
assert.equal(createProtectedItem.response.status,200);

const protectedSnapshot=await request("/api/inventory/fuxing",{cookie:admin});
const protectedItem=protectedSnapshot.data.items.find((item)=>item.item_key===protectedItemKey);
assert(protectedItem,"protected-location regression item missing");

const seedProtectedMinimum=await request("/api/inventory/set-minimum",{
  method:"POST",
  cookie:supervisor,
  body:{itemId:protectedItem.id,locationId:freezer.id,minimum:4},
});
assert.equal(seedProtectedMinimum.response.status,200);
assert.equal(Number(seedProtectedMinimum.data?.before),0);
assert.equal(Number(seedProtectedMinimum.data?.after),4);
assert.equal(seedProtectedMinimum.data?.transaction?.action,"adjust");
assert.equal(seedProtectedMinimum.data?.transaction?.metadata?.operation,"set_minimum");
assert.equal(Number(seedProtectedMinimum.data?.transaction?.metadata?.before_minimum),0);
assert.equal(Number(seedProtectedMinimum.data?.transaction?.metadata?.after_minimum),4);

const repeatProtectedMinimum=await request("/api/inventory/set-minimum",{
  method:"POST",
  cookie:supervisor,
  body:{itemId:protectedItem.id,locationId:freezer.id,minimum:4},
});
assert.equal(repeatProtectedMinimum.response.status,200);
assert.equal(Number(repeatProtectedMinimum.data?.before),4);
assert.equal(Number(repeatProtectedMinimum.data?.after),4);
assert.equal(repeatProtectedMinimum.data?.transaction,null,"no-op minimum save created duplicate history");

const protectedMinimumHistory=await request("/api/inventory/fuxing/transactions?limit=100",{cookie:admin});
assert.equal(protectedMinimumHistory.response.status,200);
const seededMinimumHistory=protectedMinimumHistory.data.transactions.find(
  (entry)=>entry.item_id===protectedItem.id
    && entry.metadata?.operation==="set_minimum"
    && Number(entry.metadata?.before_minimum)===0
    && Number(entry.metadata?.after_minimum)===4
);
assert(seededMinimumHistory,"minimum change did not appear in inventory history");
assert.equal(seededMinimumHistory.destination_location_id,freezer.id);
assert.equal(seededMinimumHistory.actor_username,"supervisorfx");

const removeProtectedLocation=await request("/api/inventory/catalog/sync",{
  method:"POST",
  cookie:admin,
  body:{
    item:{
      key:protectedItemKey,
      catalog_key:protectedCatalogKey,
      zh:"品項儲位保護測試",
      vi:"Kiểm thử bảo vệ vị trí sản phẩm",
      unit:"包",
      work_area:"noodles",
      storage_only:true,
      locations:[{code:secondStorage.code,quantity:0,minimum:0}],
    },
  },
});
assert.equal(removeProtectedLocation.response.status,409,"minimum-only location removal was not blocked");
assert.equal(removeProtectedLocation.data?.error,"LOCATION_HAS_STOCK");

const clearProtectedMinimum=await request("/api/inventory/set-minimum",{
  method:"POST",
  cookie:supervisor,
  body:{itemId:protectedItem.id,locationId:freezer.id,minimum:0},
});
assert.equal(clearProtectedMinimum.response.status,200);
assert.equal(Number(clearProtectedMinimum.data?.before),4);
assert.equal(Number(clearProtectedMinimum.data?.after),0);
assert.equal(clearProtectedMinimum.data?.transaction?.metadata?.operation,"set_minimum");
assert.equal(clearProtectedMinimum.data?.transaction?.source_location_id,freezer.id);
assert.equal(Number(clearProtectedMinimum.data?.transaction?.metadata?.before_minimum),4);
assert.equal(Number(clearProtectedMinimum.data?.transaction?.metadata?.after_minimum),0);

const protectedMinimumHistoryAfterClear=await request("/api/inventory/fuxing/transactions?limit=100",{cookie:admin});
assert.equal(protectedMinimumHistoryAfterClear.response.status,200);
const protectedMinimumEntries=protectedMinimumHistoryAfterClear.data.transactions.filter(
  (entry)=>entry.item_id===protectedItem.id && entry.metadata?.operation==="set_minimum"
);
assert.equal(protectedMinimumEntries.length,2,"minimum history should contain exactly change and clear records");

const removeClearedLocation=await request("/api/inventory/catalog/sync",{
  method:"POST",
  cookie:admin,
  body:{
    item:{
      key:protectedItemKey,
      catalog_key:protectedCatalogKey,
      zh:"品項儲位保護測試",
      vi:"Kiểm thử bảo vệ vị trí sản phẩm",
      unit:"包",
      work_area:"noodles",
      storage_only:true,
      locations:[{code:secondStorage.code,quantity:999,minimum:999}],
    },
  },
});
assert.equal(removeClearedLocation.response.status,200,"cleared zero-stock location association should be removable");

const afterProtectedRemoval=await request("/api/inventory/fuxing",{cookie:admin});
assert(
  !afterProtectedRemoval.data.stock.some(
    (row)=>row.item_id===protectedItem.id && row.location_id===freezer.id
  ),
  "zeroed omitted catalog location association was not removed"
);
const remainingProtectedRow=afterProtectedRemoval.data.stock.find(
  (row)=>row.item_id===protectedItem.id && row.location_id===secondStorage.id
);
assert.equal(Number(remainingProtectedRow?.quantity),0,"catalog sync seeded quantity on new/remaining association");
assert.equal(Number(remainingProtectedRow?.minimum_quantity),0,"catalog sync seeded minimum on new/remaining association");

const archiveProtectedItem=await request("/api/inventory/catalog/archive",{
  method:"POST",
  cookie:admin,
  body:{itemKey:protectedItemKey},
});
assert.equal(archiveProtectedItem.response.status,200);
assert.equal(archiveProtectedItem.data?.archived,true);

// Central-kitchen accounts with explicit inventory edit access can use the same
// stock endpoints as the overview/editor. Catalog sync still cannot overwrite
// the dedicated physical quantity/minimum authority.
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
  body: { itemId: centralItem.id, locationId: centralFreezer.id, quantity: 19 },
});
assert.equal(centralDirectQuantity.response.status, 200, "central inventory editor could not persist quantity");

const centralDirectMinimum = await request("/api/inventory/set-minimum", {
  method: "POST",
  cookie: central,
  body: { itemId: centralItem.id, locationId: centralFreezer.id, minimum: 8 },
});
assert.equal(centralDirectMinimum.response.status, 200, "central inventory editor could not persist minimum");

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
assert.equal(Number(protectedCentralStock.quantity), 19, "central catalog sync bypassed dedicated quantity authority");
assert.equal(Number(protectedCentralStock.minimum_quantity), 8, "central catalog sync bypassed dedicated minimum authority");

console.log("catalog stocktake API regression passed");
