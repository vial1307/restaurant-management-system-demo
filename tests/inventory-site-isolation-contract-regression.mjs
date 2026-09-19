import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const cloud=read("src/inventory-cloud.js");
const app=read("src/app.js");
const routes=read("vps/backend/src/inventory-extra-routes.mjs");
const migration=read("vps/database/migrations/022_inventory_site_isolation.sql");
const audit=read(".github/workflows/inventory-site-production-audit.yml");

assert.match(cloud,/BRANCH_SNAPSHOT_KEY_PREFIX/,"branch inventory must keep per-site mirrors");
assert.match(cloud,/inventoryBranchSnapshot\(site\)/,"branch mirror reader missing");
assert.match(cloud,/saveInventoryBranchSnapshot\(site, inventory, workInventory\)/,"authoritative branch hydrate must persist a site-scoped mirror");

const fetchIndex=cloud.indexOf("const rows = await fetchSite(targetSite, { force:true });");
const commitIndex=cloud.indexOf("localStorage.setItem(ACTIVE_SITE_KEY, targetSite);",fetchIndex);
assert(fetchIndex>=0 && commitIndex>fetchIndex,"site switch must fetch target snapshot before committing active site");

assert.match(app,/saved\?\.site===site/,"offline branch drafts must carry a site marker");
assert.match(app,/baseRecord\?\.inventorySite===site/,"offline branch drafts must never seed from another site's shared record");
assert.match(app,/inventoryBranchSnapshot\(site\)/,"branch render must use site-scoped inventory mirror");

const itemSiteGuards=(routes.match(/ITEM_SITE_MISMATCH/g)||[]).length;
assert(itemSiteGuards>=3,"inventory API must reject item/location site mismatch across mutation paths");
assert.match(routes,/DESTINATION_ITEM_SITE_MISMATCH/,"direct transfer must validate destination item ownership");

assert.match(migration,/inventory_stock_site_guard/,"database stock site guard trigger missing");
assert.match(migration,/inventory_receive_defaults_site_guard/,"database receive-default site guard trigger missing");
assert.match(migration,/INVENTORY_SITE_INTEGRITY_EXISTING_VIOLATION/,"migration must stop on existing non-empty cross-site contamination");

assert.match(audit,/stock_site_mismatch/,"production audit must report cross-site stock rows");
assert.match(audit,/receive_default_site_mismatch/,"production audit must report receive-default site mismatch");
assert.match(audit,/test "\$result" = "0"/,"production audit must fail on contamination");
assert.doesNotMatch(audit,/delete\s+from|update\s+public\.|insert\s+into/i,"production inventory site audit must remain read-only");

console.log("INVENTORY_SITE_ISOLATION_CONTRACT_OK");
