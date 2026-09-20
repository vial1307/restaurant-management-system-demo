import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const backend=read("vps/backend/src/inventory-extra-routes.mjs");
const cloud=read("src/inventory-cloud.js");
const app=read("src/app.js");

const start=backend.indexOf('app.post("/api/inventory/set-minimum"');
const end=backend.indexOf('app.post("/api/inventory/catalog/sync"',start);
assert(start>=0 && end>start,"set-minimum route block missing");
const route=backend.slice(start,end);

assert.match(route,/withTransaction\(async \(client\) =>/,"set-minimum must be transactional");
assert.match(route,/select minimum_quantity[\s\S]*for update/,"set-minimum must lock the stock row before reading prior minimum");
assert.match(route,/before !== minimum/,"no-op minimum saves must not create duplicate history");
assert.match(route,/insert into public\.inventory_transactions/,"minimum changes must write inventory history");
assert.match(route,/'adjust'/,"minimum history must reuse the existing inventory transaction action contract");
assert.match(route,/'operation','set_minimum'/,"minimum history must be distinguishable from quantity adjustment");
assert.match(route,/'before_minimum'/);
assert.match(route,/'after_minimum'/);

assert.match(cloud,/meta\.operation === "set_minimum"/);
assert.match(cloud,/direction: minimumChange \? "minimum"/);
assert.match(cloud,/meta\.before_minimum/);
assert.match(cloud,/meta\.after_minimum/);

assert.match(app,/minimum:language==="zh"\?"標準量調整":"Điều chỉnh định mức · 標準量調整"/);
assert.match(app,/direction==="minimum"\?"Δ"/);
assert.match(app,/Định mức · 標準量/);

console.log("INVENTORY_MINIMUM_HISTORY_CONTRACT_OK");
