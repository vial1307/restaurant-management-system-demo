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
  /manageQuantityEdit:canDirectInventoryAdjust\(\)/,
  "Manage tab must not grant direct quantity editing from catalog permission alone"
);
assert.match(
  app,
  /element\.dataset\.manageAdjust === "true" && canManageBranchCatalog\((?:activeInventorySite\(\)|site)\) && canDirectInventoryAdjust\(\)/,
  "quantity change handler must retain the stocktake role guard"
);
assert.match(
  app,
  /const stocktakeEditable = canDirectInventoryAdjust\(\);/,
  "product modal must derive stock fields from the stocktake guard"
);
assert.match(
  app,
  /name="quantity:\$\{zone\.id\}"[^>]+readonly aria-readonly=/,
  "non-stocktake catalog editors must see quantity as read-only in the product modal"
);
assert.match(
  app,
  /name="minimum:\$\{zone\.id\}"[^>]+readonly aria-readonly=/,
  "non-stocktake catalog editors must see minimum as read-only in the product modal"
);

assert.match(
  cloud,
  /if \(!canDirectInventoryAdjust\(\)\) return \{ ok: false, fallback: false, error: new Error\("DIRECT_ADJUST_NOT_ALLOWED"\) \};/,
  "frontend VPS set-quantity wrapper must not honor an inventory-editor bypass"
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
