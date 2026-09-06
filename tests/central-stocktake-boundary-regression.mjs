import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/auth-layer.js"), "utf8");

assert.match(
  source,
  /function centralManageView\([^)]*stocktakeWritable = false\)/,
  "Central catalog management must keep stocktake authority separate from catalog write authority"
);
assert.match(
  source,
  /centralQuantityControl\(\{[^}]*direct:stocktakeWritable,manageAdjust:stocktakeWritable\}\)/,
  "Central Manage quantity controls must render only with stocktake authority"
);
assert.match(
  source,
  /function centralEditorModal\([^)]*stocktakeEditable = false\)/,
  "Central catalog editor must receive an explicit stocktake-editability boundary"
);
assert.match(
  source,
  /name="central-quantity:\$\{esc\(zone\)\}"[^>]*stocktakeEditable \? "" : 'readonly aria-readonly="true"'/,
  "Central quantity field must be read-only for catalog editors without stocktake authority"
);
assert.match(
  source,
  /name="central-minimum:\$\{esc\(zone\)\}"[^>]*stocktakeEditable \? "" : 'readonly aria-readonly="true"'/,
  "Central minimum field must be read-only for catalog editors without stocktake authority"
);
assert.match(
  source,
  /centralManageView\([^\n]*canManageCatalog, canDirectInventoryAdjust\(\)\)/,
  "Central Manage must derive stocktake controls from canDirectInventoryAdjust()"
);
assert.match(
  source,
  /centralEditorModal\([^\n]*canDirectInventoryAdjust\(\)\)/,
  "Central editor must derive stock fields from canDirectInventoryAdjust()"
);
assert.doesNotMatch(
  source,
  /manageAdjust\s*=\s*input\?\.dataset\.centralManageAdjust[^\n]*canManageCentralCatalog/,
  "Central quantity commit must not restore the catalog-manager stocktake bypass"
);
assert.doesNotMatch(
  source,
  /allowInventoryEditor:manageAdjust/,
  "Central quantity commit must not pass the retired inventory-editor bypass"
);

console.log("central stocktake boundary regression passed");
