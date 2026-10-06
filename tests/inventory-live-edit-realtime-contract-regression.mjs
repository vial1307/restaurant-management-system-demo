import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const source=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");
const app=source("src/app.js");
const auth=source("src/auth-layer.js");
const cloud=source("src/inventory-cloud.js");
const api=source("src/vps-api.js");
const backend=source("vps/backend/src/inventory-extra-routes.mjs");
const realtime=source("vps/backend/src/inventory-realtime.mjs");
const server=source("vps/backend/src/server.mjs");
const spec=source("docs/SYSTEM_SPECIFICATION.md");

assert.match(
  cloud,
  /export function canDirectInventoryAdjust\(\) \{[\s\S]{0,420}inventory\.quantity\.adjust_quick[\s\S]{0,220}inventory\.quantity\.set_absolute[\s\S]{0,220}inventory\.minimum\.edit/,
  "direct quantity/minimum authority must follow granular Inventory database actions"
);
assert.doesNotMatch(
  cloud,
  /canDirectInventoryAdjust[\s\S]{0,500}\["manager","supervisor"\]|hasInventoryPermission\(["']edit["']\)/,
  "legacy role/module edit gates must not override granular Inventory actions"
);

for(const [route,actionKey] of [
  ["set-quantity","inventory.quantity.set_absolute"],
  ["set-minimum","inventory.minimum.edit"],
]){
  const start=backend.indexOf(`app.post("/api/inventory/${route}"`);
  assert(start>=0,`${route} route missing`);
  const block=backend.slice(start,start+5200);
  assert(
    block.includes(`"${actionKey}"`),
    `${route} must enforce granular database action ${actionKey}`,
  );
  assert.doesNotMatch(block,/requireStocktakeRole|STOCKTAKE_ROLE_REQUIRED/,`${route} still uses the legacy role-name gate`);
}

assert.match(auth,/data-central-inline-work-area/,"Central overview work-area selector missing");
assert.match(auth,/data-central-inline-zone/,"Central overview storage selector missing");
assert.match(auth,/select\[data-central-inline-work-area\][\s\S]*?cloudSyncCentralCatalogItem\(itemKey,nextItems,\{sync:false\}\)[\s\S]*?syncInventoryNow\("central",\{reloadBranch:false,force:true\}\)/,"Central overview work-area edit must persist catalog metadata then reconcile");
assert.match(auth,/select\[data-central-inline-zone\][\s\S]*?cloudRelocateStorage\([\s\S]*?sync:false[\s\S]*?syncInventoryNow\("central",\{reloadBranch:false,force:true\}\)/,"Central overview storage edit must use transactional relocation then reconcile");
assert.match(cloud,/cloudRelocateStorage[\s\S]{0,1000}canManageSiteCatalog\(site\)/,"storage relocation must authorize Central and branch catalog editors consistently");

assert.match(app,/key === "zone"[\s\S]{0,500}cloudRelocateStorage/,"branch overview storage selector must use transactional relocation");
assert.match(app,/key === "workArea"[\s\S]{0,900}cloudRelocateWorkArea/,"branch overview work-area selector must use transactional relocation");
assert.match(app,/key === "minimum"[\s\S]{0,500}cloudSetMinimum/,"branch overview minimum must use its PostgreSQL endpoint");
assert.match(app,/function authoritativeBranchRecord\([\s\S]{0,700}inventoryBranchSnapshot\(site\)/,"branch controls and editor must share the authoritative cloud mirror");
assert.match(app,/function inventoryControlItem\([\s\S]{0,800}dataset\?\.stockKey/,"rendered inventory controls must carry a database mutation identity even if the in-memory store lags");
assert.match(app,/data-cloud-item-id=[\s\S]{0,220}data-cloud-location-id=/,"rendered branch controls must carry authoritative PostgreSQL ids");
assert.match(app,/const record = branchInventoryMutationRecord\(state,site\);[\s\S]{0,220}inventoryControlItem\(element,record,"item"\)/,"branch mutation handlers must resolve the rendered item from the live PostgreSQL mirror/control identity");
assert.match(app,/const inventoryRecord = branchInventoryMutationRecord\(state,site\)[\s\S]{0,1800}inventoryRecord\?\.inventory\.find/,"branch editor submit must compare against the live PostgreSQL mirror");
const changeHandler=app.slice(app.indexOf('root.addEventListener("change"'),app.indexOf('root.addEventListener("input"'));
assert.match(changeHandler,/\}, true\);/,"inventory change delegation must run in capture phase so nested UI layers cannot swallow database writes");
assert.match(cloud,/cloudSetMinimum\(\{[\s\S]{0,220}itemId = ""[\s\S]{0,220}locationId = ""[\s\S]{0,500}itemId && locationId/,"minimum writes must accept the PostgreSQL ids already present in the rendered snapshot");

assert.match(realtime,/app\.get\("\/api\/inventory\/events"[\s\S]*?requireUser[\s\S]*?inventoryAllowedSites\(user,"inventory\.view"\)/,"SSE stream must be authenticated and DB Inventory-view authorized");
assert.match(realtime,/app\.addHook\("onResponse"[\s\S]*?route\.startsWith\("\/api\/inventory\/"\)[\s\S]*?publishInventoryInvalidation/,"successful inventory mutations must publish realtime invalidation");
assert.match(server,/registerInventoryRealtime\(app\)[\s\S]*?registerInventoryExtraRoutes\(app\)/,"realtime hook must be registered before inventory mutation routes");
assert.match(api,/X-Kitchen-Client-Id["']?: vpsInventoryClientId\(\)/,"inventory writes must identify their originating browser tab");
assert.match(cloud,/new EventSource\(`\/api\/inventory\/events\?clientId=/,"inventory client must subscribe to the authenticated SSE stream");
assert.match(cloud,/payload\?\.sourceClientId && payload\.sourceClientId === clientId[\s\S]{0,320}setTimeout[\s\S]{0,260}syncInventoryNow\(activeSite, \{ reloadBranch:false, force:true \}\)/,"remote invalidations must ignore self, coalesce, and force authoritative reconciliation");
assert.match(cloud,/if \(viewChanged && !changed\)[\s\S]{0,220}shitu:inventory-cloud-updated/,"per-document reconciliation must repaint a peer tab even when shared localStorage already contains the new snapshot");

assert.match(spec,/Authenticated Server-Sent Events provide the primary real-time invalidation signal/,"canonical synchronization specification is missing SSE authority");
assert.match(spec,/role name must not re-deny quantity or minimum editing/,"canonical permission specification is missing edit-grant authority");

console.log("inventory live-edit/realtime contract regression passed");
