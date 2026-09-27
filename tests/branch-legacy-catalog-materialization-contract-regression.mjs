import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const store=read("src/store-core.js");
const migration=read("vps/database/migrations/027_branch_legacy_catalog_materialization.sql");
const admin=read("src/admin-inventory-database.js");
const realtime=read("vps/backend/src/inventory-realtime.mjs");
const superAdminRoutes=read("vps/backend/src/super-admin-routes.mjs");
const routes=read("vps/backend/src/inventory-extra-routes.mjs");
const cloud=read("src/inventory-cloud.js");

function section(source,start,end) {
  const from=source.indexOf(start);
  const to=source.indexOf(end,from);
  assert(from>=0 && to>from,`missing section ${start}`);
  return source.slice(from,to);
}

function ids(source) {
  return [...source.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((match)=>match[1]);
}

const freezerIds=ids(section(store,"const LARGE_FREEZER_SHEET_ITEMS","export const DEFAULT_ITEMS"));
const defaultIds=ids(section(store,"export const DEFAULT_ITEMS","const STOCK_KEYS"));
assert.equal(freezerIds.length,58,"legacy large-freezer catalog row count changed; migration 027 manifest must be reviewed");
assert.equal(defaultIds.length,19,"legacy default catalog row count changed; migration 027 manifest must be reviewed");
assert.equal(freezerIds.length+defaultIds.length,77);

const canonicalSuffix=(id)=>{
  if(["tofu-kitchen","tofu-large"].includes(id)) return "tofu";
  if(["duck-tongue-kitchen","duck-tongue-large"].includes(id)) return "duck-tongue";
  if(["duck-wing-kitchen","duck-wing-large"].includes(id)) return "duck-wing";
  if(id==="duck-intestine-kitchen") return "duck-intestine-box";
  if(id==="duck-intestine-large") return "duck-intestine";
  if(id==="oxtail-rice") return "oxtail-rice-box";
  if(id==="oxtail-rice-freezer") return "oxtail-rice";
  return id;
};

const expected=new Set([...defaultIds,...freezerIds].map(canonicalSuffix));
expected.add("freezer-sous-vide-chicken");
assert.equal(expected.size,75,"canonical legacy branch catalog identity count changed");

const catalogSection=section(
  migration,
  "insert into legacy_branch_catalog(item_suffix,name_zh_tw,name_vi,unit,work_area,storage_only) values",
  "create temporary table legacy_branch_catalog_locations"
);
const migratedIds=new Set(
  [...catalogSection.matchAll(/\('([^']+)'\s*,/g)].map((match)=>match[1])
);
assert.equal(migratedIds.size,75,"migration 027 catalog identity count");
assert.deepEqual([...migratedIds].sort(),[...expected].sort(),
  "migration 027 must materialize every legacy branch product identity");

assert.match(migration,/metadata->>'inventory_mode',''\)='branch'/,
  "branch discovery must come from PostgreSQL site master data");
assert.match(migration,/create temporary table legacy_branch_sites[\s\S]{0,700}inventory_locations[\s\S]{0,400}kind='storage'/,
  "materialization must run only for database-configured branch inventories");
assert.match(migration,/on conflict\(item_id,location_id\) do nothing/g,
  "existing stock associations must be preserved");
assert.doesNotMatch(migration,/update\s+public\.inventory_stock\s+set/i,
  "catalog materialization must never rewrite current physical quantity/minimum");
assert.match(migration,/'item_suffixes',[\s\S]{0,240}jsonb_agg\(item_suffix order by item_suffix\)/,
  "migration audit must preserve the exact product manifest for production verification");
assert.match(migration,/system_branch_legacy_catalog_materialize/,
  "materialization must be auditable");
assert.match(migration,/Every active branch product with a configured work_area[\s\S]{0,1000}l\.metadata->>'work_area'=i\.work_area/,
  "migration 027 must project every active branch item into its database work area");
assert.doesNotMatch(
  section(migration,"-- Every active branch product with a configured work_area","-- A branch item with a valid work_area"),
  /storage_only\s*=\s*false/,
  "storage_only legacy flags must not hide products from 工作區"
);
assert.match(migration,/sync_branch_inventory_item_work_projection/,
  "PostgreSQL must preserve the branch item-to-work-area invariant after migration");

assert.match(admin,/request\(\`\/api\/master-data\/\$\{encodeURIComponent\(targetSite\)\}\?includeInactive=true\`\)/,
  "Super Admin inventory database must read location/work-area master data from VPS");
assert.match(admin,/request\(\`\/api\/inventory\/\$\{encodeURIComponent\(targetSite\)\}\?includeInactive=true\`\)/,
  "Super Admin inventory database must read catalog/stock directly from VPS");
assert.match(admin,/path="\/api\/inventory\/catalog\/sync"/,
  "Super Admin item writes must use the inventory catalog lifecycle API");
assert.match(admin,/new EventSource\("\/api\/inventory\/events"\)/,
  "Super Admin must subscribe to realtime inventory invalidation");
assert.match(admin,/source\.addEventListener\("inventory",sync\)/,
  "Super Admin must reload after inventory SSE");
assert.match(admin,/await request\(path,\{method:"POST",body\}\)[\s\S]{0,260}await load\(\)/,
  "Super Admin mutations must reconcile from server after successful writes");
assert.doesNotMatch(admin,/DEFAULT_ITEMS|LARGE_FREEZER_SHEET_ITEMS|localStorage/,
  "Super Admin database must never use browser legacy inventory as authority");

assert.match(routes,/siteMode === "branch"[\s\S]{0,900}metadata->>'work_area'=\$2[\s\S]{0,700}attachLocation\(workLocation\.rows\[0\]\.id\)/,
  "API must repair/create branch work-area associations on every catalog sync");
assert.match(cloud,/\.\.\.\(branchWorkLocationCode\(site,draft\.workArea\)[\s\S]{0,180}\[\{ code:branchWorkLocationCode\(site,draft\.workArea\) \}\]/,
  "branch editor must include work location regardless of legacy storageOnly flag");
assert.doesNotMatch(
  section(cloud,"const item = draft ? {","} : buildBranchCatalog"),
  /!draft\.storageOnly\s*&&\s*branchWorkLocationCode/,
  "legacy storageOnly must not suppress the work-area association"
);

assert.match(realtime,/route\.startsWith\("\/api\/inventory\/"\)/,
  "inventory API mutations must invalidate subscribed Super Admin sessions");
assert.match(realtime,/request\.params\?\.dataset === "inventory-products"/,
  "generic Super Admin inventory edits must also invalidate inventory sessions");
assert.match(superAdminRoutes,/"inventory-products"[\s\S]{0,1800}allowCreate:false/,
  "generic database editor must not bypass the dedicated inventory lifecycle API");

console.log("BRANCH_LEGACY_CATALOG_MATERIALIZATION_CONTRACT_OK");
