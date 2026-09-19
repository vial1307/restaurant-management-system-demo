import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const migration=read("vps/database/migrations/024_inventory_location_archive_integrity.sql");
const masterData=read("vps/backend/src/master-data-routes.mjs");
const verifier=read("vps/scripts/verify-vps-data.sh");

assert.match(migration,/create trigger inventory_locations_archive_guard/);
assert.match(migration,/LOCATION_HAS_PROTECTED_STOCK/);
assert.match(migration,/create trigger inventory_stock_active_location_guard/);
assert.match(migration,/INVENTORY_STOCK_LOCATION_INACTIVE/);
assert.match(migration,/create trigger inventory_receive_defaults_active_location_guard/);
assert.match(migration,/RECEIVE_DEFAULT_LOCATION_INVALID/);

assert.match(
  masterData,
  /assertLocationCanArchive[\s\S]*?\(quantity>0 or minimum_quantity>0\)/,
  "master-data location archive must treat positive minimum as protected inventory configuration"
);
assert.match(
  masterData,
  /LOCATION_HAS_PROTECTED_STOCK/,
  "location archive API must expose an explicit protected-stock conflict"
);

assert.match(verifier,/schema version \$\{schema\} is older than 024/);
assert.match(verifier,/inventory location-integrity triggers = 3/);
assert.match(verifier,/inactive inventory locations with protected stock\/config/);

console.log("INVENTORY_LOCATION_ARCHIVE_INTEGRITY_CONTRACT_OK");
