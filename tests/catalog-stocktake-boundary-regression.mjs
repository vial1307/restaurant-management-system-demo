import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const app = source("src/app.js");
const cloud = source("src/inventory-cloud.js");
const backend = source("vps/backend/src/inventory-extra-routes.mjs");
const catalogSync = backend.slice(
  backend.indexOf('app.post("/api/inventory/catalog/sync"'),
  backend.indexOf('app.post("/api/inventory/catalog/archive"')
);

assert.match(
  app,
  /function quantityControl[\s\S]{0,500}inventory\.quantity\.adjust_quick[\s\S]{0,220}inventory\.quantity\.set_absolute/,
  "all quantity controls must derive +/- and direct-number editing from granular database actions"
);
assert.match(
  app,
  /key === "quantity"[\s\S]{0,220}canInventoryAction\("inventory\.quantity\.set_absolute",\{[\s\S]{0,120}locationId:item\.cloudLocationId/,
  "quantity change handler must enforce the location-scoped database action"
);
assert.match(
  app,
  /key === "minimum"[\s\S]{0,220}canInventoryAction\("inventory\.minimum\.edit",\{[\s\S]{0,120}locationId:item\.cloudLocationId/,
  "minimum change handler must enforce the location-scoped database action"
);
assert.match(
  app,
  /const canQuantity=canInventoryAction\("inventory\.quantity\.set_absolute",\{site,locationId\}\)/,
  "product modal must derive quantity editing from the location-scoped database action"
);
assert.match(
  app,
  /const canMinimum=canInventoryAction\("inventory\.minimum\.edit",\{site,locationId\}\)/,
  "product modal must derive minimum editing from the location-scoped database action"
);
assert.match(
  app,
  /name="quantity:\$\{zone\.id\}"[\s\S]{0,260}canQuantity \? "" : 'readonly aria-readonly="true"'/,
  "product modal must render quantity read-only when the location action is denied"
);
assert.match(
  app,
  /name="minimum:\$\{zone\.id\}"[\s\S]{0,260}canMinimum \? "" : 'readonly aria-readonly="true"'/,
  "product modal must render minimum read-only when the location action is denied"
);

assert.match(
  cloud,
  /cloudSetQuantity[\s\S]{0,1500}canInventoryAction\("inventory\.quantity\.set_absolute",[\s\S]{0,180}locationId:resolved\.location\.id/,
  "frontend VPS set-quantity wrapper must enforce the concrete location database action"
);
assert.match(
  cloud,
  /cloudSetMinimum[\s\S]{0,1500}canInventoryAction\("inventory\.minimum\.edit",[\s\S]{0,200}locationId:resolved\.location\.id/,
  "frontend VPS set-minimum wrapper must enforce the concrete location database action"
);
assert.doesNotMatch(
  cloud,
  /allowInventoryEditor && canInventoryEdit\(\)/,
  "legacy inventory-editor quantity bypass must remain removed"
);
assert.match(
  cloud,
  /cloudSyncBranchCatalogItem\(stockKey, site = currentSite\(\), \{ sync = true, draft = null \} = \{\}\)/,
  "catalog metadata sync must support deferring refresh while dedicated stock APIs run"
);

assert.match(
  app,
  /async function persistCatalogStocktakeFields[\s\S]*?cloudSetQuantity\([\s\S]*?sync:false[\s\S]*?cloudSetMinimum\([\s\S]*?sync:false/,
  "product modal stock fields must be persisted through dedicated stocktake APIs"
);
assert.match(
  app,
  /cloudSyncBranchCatalogItem\(stockKey, site, \{ sync:false, draft:item \}\)[\s\S]*?persistCatalogStocktakeFields/,
  "edit-item save must sync metadata before dedicated stock fields"
);
assert.match(
  app,
  /cloudSyncBranchCatalogItem\(createdStockKey,site,\{sync:false,draft:item\}\)[\s\S]*?persistCatalogStocktakeFields/,
  "add-item save must sync metadata before dedicated stock fields"
);

assert.doesNotMatch(
  catalogSync,
  /stocktakeWrite|quantity=excluded\.quantity|minimum_quantity=excluded\.minimum_quantity/,
  "catalog sync must never be an alternate physical stocktake write authority"
);
assert.match(
  catalogSync,
  /values\(\$1,\$2,0,0,now\(\)\)[\s\S]*?on conflict\(item_id,location_id\) do nothing/,
  "catalog sync may create only zeroed stock associations"
);
assert.match(
  catalogSync,
  /\(s\.quantity>0 or s\.minimum_quantity>0\)[\s\S]*?LOCATION_HAS_STOCK/,
  "removing a catalog location must reject quantity or minimum configuration"
);
assert.match(
  catalogSync,
  /and quantity=0[\s\S]*?and minimum_quantity=0/,
  "catalog sync may delete an omitted location association only when quantity and minimum are both zero"
);

console.log("catalog stock authority boundary regression passed");
