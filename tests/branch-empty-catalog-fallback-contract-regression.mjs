import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/inventory-cloud.js"), "utf8");
const match = source.match(/function buildBranchCatalog\([\s\S]*?\n}\n\nfunction buildCentralCatalog/);
assert(match, "buildBranchCatalog() not found");
const body = match[0];

assert.match(
  body,
  /const inventory = Array\.isArray\(record\?\.inventory\)\s*\?\s*record\.inventory\s*:\s*DEFAULT_ITEMS;/,
  "branch catalog must treat every inventory array, including [], as authoritative"
);
assert.doesNotMatch(
  body,
  /Array\.isArray\(record\?\.inventory\)\s*&&\s*record\.inventory\.length/,
  "branch catalog must not replace an authoritative empty inventory with DEFAULT_ITEMS"
);

console.log("BRANCH_EMPTY_CATALOG_FALLBACK_CONTRACT_OK");
