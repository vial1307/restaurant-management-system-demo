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
  /const inventory = Array\.isArray\(record\?\.inventory\)\s*\?\s*record\.inventory\s*:\s*\[\];/,
  "branch catalog must treat every inventory array, including [], as authoritative and must not synthesize DB master data from code"
);
assert.doesNotMatch(
  body,
  /\bDEFAULT_ITEMS\b/,
  "production branch catalog must never fall back to DEFAULT_ITEMS"
);
assert.doesNotMatch(
  body,
  /Array\.isArray\(record\?\.inventory\)\s*&&\s*record\.inventory\.length/,
  "branch catalog must not replace an authoritative empty inventory with a fallback catalog"
);

console.log("BRANCH_EMPTY_CATALOG_FALLBACK_CONTRACT_OK");
