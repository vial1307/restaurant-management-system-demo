import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");

assert.match(
  source,
  /const stocktakeEditable = canDirectInventoryAdjust\(\);/,
  "Branch product editor must derive stocktake authority from canDirectInventoryAdjust()"
);
assert.match(
  source,
  /name="workMinimum" value="\$\{working\?\.minimum \?\? \(stocktakeEditable \? 1 : 0\)\}" \$\{stocktakeEditable \? "" : 'readonly aria-readonly="true"'\}/,
  "Branch work minimum must be read-only without stocktake authority"
);
assert.doesNotMatch(
  source,
  /name="workMinimum" value="\$\{working\?\.minimum \?\? 1\}" \/>/,
  "Legacy always-editable work minimum field must not return"
);

console.log("branch work minimum stocktake boundary regression passed");
