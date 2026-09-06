import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const app = source("src/app.js");
const cloud = source("src/inventory-cloud.js");
const backend = source("vps/backend/src/inventory-extra-routes.mjs");

assert.match(
  app,
  /manageQuantityEdit:canDirectInventoryAdjust\(\)/,
  "Manage tab must not grant direct quantity editing from catalog permission alone"
);
assert.match(
  app,
  /element\.dataset\.manageAdjust === "true" && canManageBranchCatalog\(activeInventorySite\(\)\) && canDirectInventoryAdjust\(\)/,
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
  backend,
  /const stocktakeWrite = canStocktakeRole\(user,site\);/,
  "catalog sync must compute the stocktake write boundary server-side"
);
assert.match(
  backend,
  /if \(stocktakeWrite\) \{[\s\S]*?quantity=excluded\.quantity,[\s\S]*?minimum_quantity=excluded\.minimum_quantity,[\s\S]*?\} else \{[\s\S]*?on conflict\(item_id,location_id\) do nothing/,
  "catalog-only editors may create zeroed stock rows but must not overwrite quantity/minimum"
);

console.log("catalog stocktake boundary regression passed");
