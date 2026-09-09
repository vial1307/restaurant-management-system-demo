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
  assert.match(body, /role\(\)\s*!==\s*["']admin["']/, `${name} must enforce admin-only archive at the frontend boundary`);
  assert.doesNotMatch(body, /canDirectInventoryAdjust\(\)/, `${name} must not reuse the broader stocktake role boundary`);
  assert.match(body, /vpsArchiveCatalogItem\(/, `${name} must keep using the canonical VPS archive endpoint`);
}

assert.match(
  backend,
  /app\.post\(["']\/api\/inventory\/catalog\/archive["'][\s\S]*?user\.role\s*!==\s*["']admin["'][\s\S]*?ADMIN_REQUIRED/,
  "backend catalog archive must remain admin-only"
);

console.log("CATALOG_ARCHIVE_ADMIN_BOUNDARY_OK");
