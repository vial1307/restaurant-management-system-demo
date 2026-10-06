import assert from "node:assert/strict";
import fs from "node:fs";

const inventoryCloud = fs.readFileSync(new URL("../src/inventory-cloud.js", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../vps/backend/src/inventory-extra-routes.mjs", import.meta.url), "utf8");

function functionBody(name) {
  const start = inventoryCloud.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = inventoryCloud.indexOf("\nexport ", start + 1);
  return inventoryCloud.slice(start, next === -1 ? inventoryCloud.length : next);
}

for (const name of ["cloudArchiveCentralItem", "cloudArchiveBranchItem"]) {
  const body = functionBody(name);
  assert.match(
    body,
    /canInventoryAction\("inventory\.product\.archive",\{site(?::"central")?\}\)/,
    `${name} must enforce the database-backed inventory.product.archive action at the frontend boundary`
  );
  assert.doesNotMatch(body, /role\(\)|accountRole|canDirectInventoryAdjust\(\)/,
    `${name} must not derive archive authority from role or the broader stocktake boundary`);
  assert.match(body, /vpsArchiveCatalogItem\(/, `${name} must keep using the canonical VPS archive endpoint`);
}

assert.match(
  backend,
  /app\.post\(["']\/api\/inventory\/catalog\/archive["'][\s\S]*?inventoryActionAllowed\(user,"inventory\.product\.archive",\{site\},client\)/,
  "backend catalog archive must enforce inventory.product.archive from the database policy"
);
assert.doesNotMatch(
  backend,
  /app\.post\(["']\/api\/inventory\/catalog\/archive["'][\s\S]{0,900}?user\.role\s*!==\s*["']admin["']/,
  "backend catalog archive must not derive authority from job title"
);

console.log("CATALOG_ARCHIVE_PERMISSION_BOUNDARY_OK");
