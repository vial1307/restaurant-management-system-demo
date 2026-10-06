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

assert.doesNotMatch(store,/DEFAULT_ITEMS|LARGE_FREEZER_SHEET_ITEMS|STOCK_KEYS|inferWorkArea|export const ZONES|export const WORK_AREAS/,
  "schema 027, not browser source constants, must remain the historical branch catalog authority");

const catalogSection=section(
  migration,
  "insert into legacy_branch_catalog(item_suffix,name_zh_tw,name_vi,unit,work_area,storage_only) values",
  "create temporary table legacy_branch_catalog_locations"
);
const migratedIds=new Set(
  [...catalogSection.matchAll(/\('([^']+)'\s*,/g)].map((match)=>match[1])
);
assert.equal(migratedIds.size,75,"migration 027 catalog identity count");
for (const requiredId of [
  "tofu","duck-tongue","duck-wing","duck-intestine","oxtail-rice",
  "freezer-sous-vide-chicken","freezer-lobster","frozen-noodles"
]) {
  assert(migratedIds.has(requiredId),`schema 027 is missing canonical legacy identity ${requiredId}`);
}

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

assert.match(admin,/request\(\`\/api\/admin\/inventory-database\/\$\{encodeURIComponent\(targetSite\)\}\`\)/,
  "Super Admin inventory database must read master/catalog/stock from the VPS combined snapshot");
assert.match(admin,/path="\/api\/inventory\/catalog\/sync"/,
  "Super Admin item writes must use the inventory catalog lifecycle API");
assert.match(admin,/new EventSource\(\`\/api\/inventory\/events\?clientId=/,
  "Super Admin must subscribe to realtime inventory invalidation with a stable client identity");
assert.match(admin,/source\.addEventListener\("inventory",[\s\S]{0,300}invalidateSiteCache\(site\)[\s\S]{0,120}sync\(\{force:true\}\)/,
  "Super Admin must invalidate its site snapshot and reload after remote inventory SSE");
assert.match(admin,/await request\(path,\{method:"POST",body\}\)[\s\S]{0,220}invalidateSiteCache\(site\)[\s\S]{0,220}load\(\{force:true\}\)/,
  "Super Admin mutations must invalidate cache and reconcile from server after successful writes");
assert.doesNotMatch(admin,/DEFAULT_ITEMS|LARGE_FREEZER_SHEET_ITEMS|localStorage/,
  "Super Admin database must never use browser legacy inventory as authority");

const branchWorkProjectionSection=section(
  routes,
  'const siteMode = (await client.query(',
  'const requestedPrimaryCode=String('
);
assert.match(branchWorkProjectionSection,/siteMode === "branch"/,
  "catalog sync must keep the database-driven branch Work Area projection");
assert.match(branchWorkProjectionSection,/kind=\'work\'/,
  "branch Work Area projection must resolve a work-kind location");
assert.match(branchWorkProjectionSection,/metadata->>\'work_area\'=\$2/,
  "branch Work Area projection must resolve the site-scoped Work Area code from PostgreSQL");
assert.match(branchWorkProjectionSection,/\[site,target\.work_area\]/,
  "branch Work Area projection must be scoped to the current site and requested Work Area");
assert.match(branchWorkProjectionSection,/attachLocation\(workLocation\.rows\[0\]\.id,\{kind:"work"\}\)/,
  "API must repair/create branch work-area associations on every catalog sync");
const branchDraftSection=section(cloud,"const item = draft ? {","} : buildBranchCatalog");
assert.match(
  branchDraftSection,
  /work_area:draft\.workArea, storage_only:Boolean\(draft\.storageOnly\)/,
  "branch editor must always send the database-owned Work Area identity independently of legacy storageOnly"
);
assert.doesNotMatch(
  branchDraftSection,
  /!draft\.storageOnly[\s\S]{0,160}workArea|storageOnly\s*\?[\s\S]{0,160}work_area/,
  "legacy storageOnly must not suppress the Work Area identity"
);
assert.match(
  branchWorkProjectionSection,
  /attachLocation\(workLocation\.rows\[0\]\.id,\{kind:"work"\}\)/,
  "backend catalog lifecycle remains authoritative for materializing the Work Location stock projection"
);

assert.match(realtime,/route\.startsWith\("\/api\/inventory\/"\)/,
  "inventory API mutations must invalidate subscribed Super Admin sessions");
assert.match(realtime,/request\.params\?\.dataset === "inventory-products"/,
  "generic Super Admin inventory edits must also invalidate inventory sessions");
assert.match(superAdminRoutes,/"inventory-products"[\s\S]{0,1800}allowCreate:false/,
  "generic database editor must not bypass the dedicated inventory lifecycle API");

console.log("BRANCH_LEGACY_CATALOG_MATERIALIZATION_CONTRACT_OK");
