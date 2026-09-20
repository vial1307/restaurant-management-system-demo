import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");
const routes=read("vps/backend/src/master-data-routes.mjs");

const locationStart=routes.indexOf('app.post("/api/master-data/locations"');
const workAreaStart=routes.indexOf('app.post("/api/master-data/work-areas"',locationStart);
const overviewStart=routes.indexOf('app.get("/api/admin/overview"',workAreaStart);
assert(locationStart>=0 && workAreaStart>locationStart && overviewStart>workAreaStart);

const location=routes.slice(locationStart,workAreaStart);
const workArea=routes.slice(workAreaStart,overviewStart);

assert.match(routes,/function jsonEqual\(left, right\)/);
assert.match(location,/if \(!current\.active\) return current;/,"repeated location archive must be a no-op");
assert.match(location,/const unchanged =[\s\S]*jsonEqual\(current\.metadata, metadata\)/);
assert.match(location,/if \(unchanged\) return current;/,"no-op location save must skip update/audit");
assert.match(location,/master_location_update/);
assert.match(location,/master_location_archive/);

assert.match(workArea,/if \(!current\.active\) return current;/,"repeated work-area archive must be a no-op");
assert.match(workArea,/const unchanged =[\s\S]*jsonEqual\(current\.metadata, metadata\)/);
assert.match(workArea,/if \(unchanged\) return current;/,"no-op work-area save must skip update/audit");
assert.match(workArea,/master_work_area_update/);
assert.match(workArea,/master_work_area_archive/);

console.log("MASTER_DATA_NOOP_AUDIT_CONTRACT_OK");
