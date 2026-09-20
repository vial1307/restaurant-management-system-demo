import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const backend=read("vps/backend/src/inventory-extra-routes.mjs");
const start=backend.indexOf('app.post("/api/inventory/catalog/sync"');
const end=backend.indexOf('app.post("/api/inventory/catalog/archive"',start);
assert(start>=0 && end>start,"catalog sync route block missing");
const route=backend.slice(start,end);

assert.match(route,/withTransaction\(async \(client\) =>/,"catalog sync must be transactional");
assert.match(route,/pg_advisory_xact_lock\(hashtext\(\$1\)\)/,"catalog sync must serialize per item key");
assert.match(route,/where item_key=\$1[\s\S]*for update/,"existing catalog item must be locked");
assert.match(route,/const before = itemSnapshot\(current,beforeLocations\)/);
assert.match(route,/const after = itemSnapshot\(savedItem,afterLocations\)/);
assert.match(route,/const changed = JSON\.stringify\(before\) !== JSON\.stringify\(after\)/);
assert.match(route,/if \(changed\) \{/,"catalog audit must be suppressed on no-op");
assert.match(route,/'inventory_catalog_change'/);
assert.match(route,/'inventory_item'/);
assert.match(route,/'item_key'/);
assert.match(route,/'catalog_key'/);
assert.match(route,/const operation = before \? "update" : "create"/);
assert.match(route,/before_data,after_data,metadata/);
assert.match(route,/values\(\$1,\$2,0,0,now\(\)\)/,"new catalog associations must remain zeroed");
assert.doesNotMatch(route,/Number\(loc\.quantity/,"catalog sync must not persist request quantity");
assert.doesNotMatch(route,/Number\(loc\.minimum/,"catalog sync must not persist request minimum");

console.log("INVENTORY_CATALOG_AUDIT_CONTRACT_OK");
