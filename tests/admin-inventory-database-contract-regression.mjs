import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { INVENTORY_ADMIN_TEXT } from "../src/admin-inventory-i18n.js";
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const ui=read("src/admin-inventory-database.js");
for(const path of ["/api/master-data/","/api/inventory/catalog/sync","/api/inventory/catalog/archive","/api/inventory/receive-default","/api/inventory/relocate-","/api/inventory/set-"])assert(ui.includes(path),path);
assert.doesNotMatch(ui,/location\.reload|localStorage|MutationObserver/);
assert.match(ui,/expectedRevision:revision\(row\)/);
assert.match(ui,/appendLocations:true/);
assert.match(ui,/quiet&&\(editor\|\|pending\)/);
assert.match(ui,/seq!==generation/);
assert.match(ui,/pending\)return;pending=true/);
assert.match(ui,/inventory\/events/);
assert.match(ui,/deferredSite/);
assert.match(ui,/applyDeferredSite\(\)/);
assert.match(ui,/if \(editor \|\| pending \|\| dirty\)[\s\S]{0,120}deferredSite = nextSite/, "realtime site changes must defer active-site replacement while an editor is dirty");
assert.match(ui,/const derivedWork = locationKind === "work"/, "work locations must be treated as a database-derived projection of work areas");
assert.match(ui,/workLocationSyncHint/, "Super Admin must explain automatic work-location synchronization");
assert.match(ui,/missingWorkLocation/, "Super Admin integrity view must detect work areas without work locations");
assert.match(ui,/orphanWorkLocation/, "Super Admin integrity view must detect orphan work locations");
assert.match(ui,/invalidStorageGroup/, "Super Admin integrity view must detect unclassified storage");
assert.match(ui,/workStockMismatch/, "Super Admin integrity view must detect item/work-location mismatches");
assert.match(ui,/missingWorkStock/, "Super Admin integrity view must detect active products missing their work-area projection");
assert.match(ui,/\["primary","service"\]\.includes\(storageGroup\) \? t\(storageGroup\) : t\("unconfigured"\)/,
  "Super Admin must not display invalid or missing storage classification as primary");
assert.match(ui,/\["internal","factory"\]\.includes\(replenishmentPolicy\) \? t\(replenishmentPolicy\) : t\("unconfigured"\)/,
  "Super Admin must expose the database replenishment policy instead of inferring it from a location name");
assert.match(ui,/select\("replenishment_policy","replenishmentPolicy"/,
  "storage editor must expose replenishment policy");
assert.match(ui,/body\.metadata\.replenishment_policy=value\("replenishment_policy"\)/,
  "storage editor must persist replenishment policy through the master-data API");
assert.match(ui,/invalidReplenishmentPolicy/,
  "Super Admin integrity must detect missing or invalid replenishment policy");
assert.match(ui,/initial\.metadata\?\.storage_group\|\|"service"/,
  "new storage locations must follow the database service default until explicitly reclassified");
assert.match(ui,/initial\.metadata\?\.replenishment_policy\|\|"internal"/,
  "new storage locations must explicitly default to internal replenishment in the editor");
for(const [key,pair] of Object.entries(INVENTORY_ADMIN_TEXT))assert(pair.length===2&&pair.every(Boolean),key);
assert.match(read(".admindev.html"),/admin-inventory-database\.css/);
assert.match(read("src/admin-panel.js"),/inventoryDatabase\.mount/);
assert.match(read("src/admin-panel.js"),/Database Control Plane/);
assert.match(read("src/admin-panel.js"),/Database kho · 庫存資料庫/);
assert.match(read("src/admin-inventory-database.css"),/@media\(max-width:760px\)/);
const routes=read("vps/backend/src/inventory-extra-routes.mjs");
assert.match(routes,/expectedQuantity/);assert.match(routes,/expectedMinimum/);assert.match(routes,/expectedLocationCode/);
assert.match(routes,/explicitLocations.length && !request.body\?\.appendLocations/,
  "catalog sync may prune locations only when the caller explicitly supplies a location list");
assert.match(routes,/guardWorkArea/);
assert.match(routes,/siteMode === "branch"[\s\S]{0,900}metadata->>'work_area'=\$2[\s\S]{0,700}attachLocation\(workLocation\.rows\[0\]\.id\)/,
  "branch catalog sync must always attach the database work-area row, including storage_only products");
// Execute the real SSE hook: successful master writes invalidate, reads/failures do not.
const events=[],hooks={},clients=[];
const app={get:(path,handler)=>{clients.push(handler);},addHook:(name,fn)=>{hooks[name]=fn;}};
const realtime=read("vps/backend/src/inventory-realtime.mjs").replace(/^import .*;\n/,"").replace("export async function registerInventoryRealtime","async function registerInventoryRealtime");
const context=vm.createContext({Set,Date,JSON,String,Math,setInterval:()=>({unref(){}}),clearInterval(){},requireUser:async()=>({}),hasPermission:()=>true});
vm.runInContext(`${realtime}\nthis.register=registerInventoryRealtime;`,context);
await context.register(app);
await clients[0]({raw:{on(){}}},{hijack(){},raw:{writeHead(){},flushHeaders(){},write:(data)=>events.push(data)}});
const emit=async(route,status=200,method="POST",params={})=>hooks.onResponse({method,routeOptions:{url:route},headers:{},params},{statusCode:status});
const start=events.length;
await emit("/api/master-data/locations");await emit("/api/master-data/work-areas");await emit("/api/admin/super/data/:dataset",200,"POST",{dataset:"inventory-products"});await emit("/api/admin/super/inventory-catalog-identity");
assert.equal(events.length,start+4);
await emit("/api/admin/super/sites");
assert.equal(events.length,start+5);
assert.match(events.at(-1),/event: site-registry/);
await emit("/api/master-data/locations",409);await emit("/api/master-data/locations",200,"GET");await emit("/api/admin/super/sites",409);await emit("/api/admin/super/settings");
assert.equal(events.length,start+5);
await hooks.onClose();
console.log("ADMIN_INVENTORY_DATABASE_CONTRACT_OK");
