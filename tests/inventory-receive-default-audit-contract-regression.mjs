import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const backend=read("vps/backend/src/inventory-extra-routes.mjs");

const start=backend.indexOf('app.post("/api/inventory/receive-default"');
const end=backend.indexOf('app.post("/api/inventory/set-quantity"',start);
assert(start>=0 && end>start,"receive-default route block missing");
const route=backend.slice(start,end);

assert.match(route,/withTransaction\(async \(client\) =>/,"receive-default must be transactional");
assert.match(route,/pg_advisory_xact_lock\(hashtext\(\$1\)\)/,"receive-default create/update/delete must serialize even when no row exists");
assert.match(route,/for update of d/,"receive-default must lock the current routing row");
assert.match(route,/current\?\.location_id === target\.id/,"same-location save must be a no-op");
assert.match(route,/deleted:false,changed:false,audit:null/);
assert.match(route,/insert into public\.audit_logs/,"receive-default changes must write audit_logs");
assert.match(route,/'inventory_receive_default_change'/);
assert.match(route,/'inventory_receive_default'/);
assert.match(route,/'catalog_key'/);
assert.match(route,/'operation','delete'/);
assert.match(route,/const operation = current \? "update" : "create"/);
assert.match(route,/before_data,after_data,metadata/);
assert.match(route,/JSON\.stringify\(\{location_id:current\.location_id,location_code:current\.location_code\}\)/);

console.log("INVENTORY_RECEIVE_DEFAULT_AUDIT_CONTRACT_OK");
