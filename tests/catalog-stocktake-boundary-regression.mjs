import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const app = source("src/app.js");
const cloud = source("src/inventory-cloud.js");
const api = source("src/vps-api.js");
const backend = source("vps/backend/src/inventory-extra-routes.mjs");

const catalogSync = backend.slice(
  backend.indexOf('app.post("/api/inventory/catalog/sync"'),
  backend.indexOf('app.post("/api/inventory/catalog/archive"')
);
const editorSave = backend.slice(
  backend.indexOf('app.post("/api/inventory/editor/save"'),
  backend.indexOf('app.post("/api/inventory/catalog/sync"')
);

assert.match(app,/manageQuantityEdit:canDirectInventoryAdjust\(\)/);
assert.match(
  app,
  /element\.dataset\.manageAdjust === "true" && canManageBranchCatalog\((?:activeInventorySite\(\)|site)\) && canDirectInventoryAdjust\(\)/
);
assert.match(app,/const stocktakeEditable = canDirectInventoryAdjust\(\);/);
assert.match(app,/name="quantity:\$\{zone\.id\}"[^>]+readonly aria-readonly=/);
assert.match(app,/name="minimum:\$\{zone\.id\}"[^>]+readonly aria-readonly=/);

assert.match(
  cloud,
  /if \(!canDirectInventoryAdjust\(\)\) return \{ ok: false, fallback: false, error: new Error\("DIRECT_ADJUST_NOT_ALLOWED"\) \};/
);
assert.doesNotMatch(cloud,/allowInventoryEditor && canInventoryEdit\(\)/);

assert.match(cloud,/export async function cloudSaveBranchInventoryEditor\(/);
assert.match(cloud,/stocktake:canDirectInventoryAdjust\(\)/);
assert.match(cloud,/await vpsSaveInventoryEditor\(body\)/);
assert.match(api,/apiRequest\("\/api\/inventory\/editor\/save"/);

assert.equal(
  (app.match(/await cloudSaveBranchInventoryEditor\(\{/g) || []).length,
  1,
  "ingredient modal must use one shared bulk save path for add/edit"
);
assert.doesNotMatch(
  app,
  /async function persistCatalogStocktakeFields/,
  "sequential per-location stock persistence must not return"
);
assert.doesNotMatch(
  app.slice(app.indexOf('if (["add-item", "edit-item"].includes(form.dataset.form))')),
  /await cloudSyncBranchCatalogItem[\s\S]{0,2500}await cloudSetQuantity[\s\S]{0,2500}await cloudSetMinimum/,
  "ingredient modal must not reintroduce multi-request catalog/quantity/minimum save"
);

assert.match(editorSave,/withTransaction\(async \(client\) =>/);
assert.match(editorSave,/pg_advisory_xact_lock/);
assert.match(editorSave,/select code from public\.inventory_units where code=\$1 and active=true/);
assert.match(editorSave,/for update of s/);
assert.match(editorSave,/operation','editor_set_quantity'/);
assert.match(editorSave,/operation','set_minimum'/);
assert.match(editorSave,/inventory_receive_default_change/);
assert.match(editorSave,/LOCATION_HAS_STOCK/);

assert.doesNotMatch(
  catalogSync,
  /stocktakeWrite|quantity=excluded\.quantity|minimum_quantity=excluded\.minimum_quantity/,
  "catalog sync must remain metadata/location-association only"
);
assert.match(
  catalogSync,
  /values\(\$1,\$2,0,0,now\(\)\)[\s\S]*?on conflict\(item_id,location_id\) do nothing/
);
assert.match(catalogSync,/\(s\.quantity>0 or s\.minimum_quantity>0\)[\s\S]*?LOCATION_HAS_STOCK/);
assert.match(catalogSync,/and quantity=0[\s\S]*?and minimum_quantity=0/);

console.log("catalog stock authority boundary regression passed");
