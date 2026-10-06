import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");

assert.match(
  source,
  /name="workMinimum"[\s\S]{0,260}working\?\.cloudLocationId && canInventoryAction\("inventory\.minimum\.edit",\{site,locationId:working\.cloudLocationId,workArea:selectedWorkArea\}\)/,
  "Branch work minimum must derive authority from the concrete Work Location database action"
);
assert.match(
  source,
  /name="workMinimum" value="\$\{working\?\.minimum \?\? 0\}"[\s\S]{0,220}readonly aria-readonly="true"/,
  "Branch work minimum must remain read-only when the granular minimum action is denied"
);
assert.doesNotMatch(
  source,
  /const stocktakeEditable = canDirectInventoryAdjust\(\)/,
  "Branch product editor must not fall back to the legacy site-wide stocktake guard"
);

console.log("branch work minimum granular permission boundary regression passed");
