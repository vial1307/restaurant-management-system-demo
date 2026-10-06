import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");

assert.match(
  source,
  /const selectedWorkLocation=inventoryWorkLocation\(site,selectedWorkArea\);[\s\S]{0,240}const workMinimumLocationId=String\(working\?\.cloudLocationId \|\| selectedWorkLocation\?\.id \|\| ""\);/,
  "Branch work minimum must resolve the concrete Work Location from PostgreSQL master data for both existing and new products"
);
assert.match(
  source,
  /const canWorkMinimum=workMinimumLocationId[\s\S]{0,260}canInventoryAction\("inventory\.minimum\.edit",\{site,locationId:workMinimumLocationId,workArea:selectedWorkArea\}\)/,
  "Branch work minimum must derive authority from the concrete Work Location database action"
);
assert.match(
  source,
  /name="workMinimum" value="\$\{working\?\.minimum \?\? 0\}" \$\{canWorkMinimum \? "" : 'readonly aria-readonly="true"'\}/,
  "Branch work minimum must remain read-only when the granular minimum action is denied"
);
assert.doesNotMatch(
  source,
  /const stocktakeEditable = canDirectInventoryAdjust\(\)/,
  "Branch product editor must not fall back to the legacy site-wide stocktake guard"
);

console.log("branch work minimum granular permission boundary regression passed");
