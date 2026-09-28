import assert from "node:assert/strict";
import fs from "node:fs";
import { inventorySources } from "../src/rules-core.js";
import {
  firstInventorySite,
  inventoryLocationByUiKey,
  inventoryLocationUiKey,
  inventorySiteForLocationCode,
  inventoryUiGroups,
  inventoryWorkLocation,
  isBranchInventorySite,
  replaceInventoryMasterSnapshot,
  replaceInventorySites,
} from "../src/inventory-master-data.js";

replaceInventorySites([
  { code:"central", sort_order:10, metadata:{ inventory_mode:"central" } },
  { code:"branch-a", sort_order:20, metadata:{ inventory_mode:"branch" } },
]);
replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", sort_order:10, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary", replenishment_policy:"factory" } },
    { code:"branch-a-kitchen", site:"branch-a", kind:"storage", sort_order:20, name_zh_tw:"廚房冰箱", name_vi:"Tủ bếp", metadata:{ ui_key:"kitchen", storage_group:"service", replenishment_policy:"internal" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", sort_order:10, name_zh_tw:"麵", name_vi:"Mì", metadata:{ ui_key:"noodles", work_area:"noodles" } },
  ],
  workAreas:[
    { code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true },
  ],
});

assert.equal(firstInventorySite(), "central");
assert.equal(firstInventorySite("branch"), "branch-a");
assert.equal(isBranchInventorySite("branch-a"), true);
assert.equal(inventoryLocationByUiKey("branch-a", "large-freezer")?.code, "branch-a-freezer");
assert.equal(inventoryWorkLocation("branch-a", "noodles")?.code, "branch-a-work-noodles");
assert.equal(inventorySiteForLocationCode("branch-a-kitchen"), "branch-a");
assert.equal(inventoryLocationUiKey(inventoryLocationByUiKey("branch-a", "kitchen")), "kitchen");

const groups = inventoryUiGroups("branch-a");
assert.deepEqual(groups.storage.map((entry) => entry.id), ["large-freezer", "kitchen"]);
assert.deepEqual(groups.storage.map((entry) => entry.storageGroup), ["primary", "service"]);
assert.deepEqual(groups.storage.map((entry) => entry.replenishmentPolicy), ["factory", "internal"]);
assert.deepEqual(groups.workAreas.map((entry) => entry.id), ["noodles"]);
assert.deepEqual(groups.storage.map((entry) => entry.sortOrder), [10, 20]);

const routingGroups = [
  { id:"reserve-alpha", storageGroup:"primary", sortOrder:10 },
  { id:"reserve-gamma", storageGroup:"primary", sortOrder:30 },
  { id:"service-beta", storageGroup:"service", sortOrder:20 },
];
const routingRecord = {
  inventory:[
    { id:"alpha", stockKey:"ingredient-x", zone:"reserve-alpha", quantity:2 },
    { id:"gamma", stockKey:"ingredient-x", zone:"reserve-gamma", quantity:9 },
    { id:"beta", stockKey:"ingredient-x", zone:"service-beta", quantity:6 },
    { id:"other", stockKey:"ingredient-y", zone:"reserve-alpha", quantity:99 },
  ],
};
const workItem = { id:"work-x", stockKey:"ingredient-x", quantity:0 };
assert.deepEqual(
  inventorySources(routingRecord, workItem, "work", routingGroups).map((entry) => entry.zone),
  ["reserve-alpha", "reserve-gamma", "service-beta"],
  "work-area replenishment must follow database storage class + sort order instead of legacy zone names",
);
assert.deepEqual(
  inventorySources(routingRecord, { id:"beta", stockKey:"ingredient-x" }, "service-beta", routingGroups).map((entry) => entry.zone),
  ["reserve-alpha", "reserve-gamma"],
  "service storage must source only from database-classified primary storage",
);
assert.deepEqual(
  inventorySources(routingRecord, { id:"alpha", stockKey:"ingredient-x" }, "reserve-alpha", routingGroups).map((entry) => entry.zone),
  ["reserve-gamma"],
  "primary storage replenishment must stay within database-classified primary storage",
);

assert.throws(() => replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", active:true, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary", replenishment_policy:"factory" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", active:true, sort_order:10, name_zh_tw:"麵", name_vi:"Mì", metadata:{ ui_key:"noodles", work_area:"noodles", storage_group:"service" } },
  ],
  workAreas:[{ code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true }],
}), /INVENTORY_WORK_LOCATION_STORAGE_GROUP_FORBIDDEN/,
"work locations must never carry storage classification");

assert.throws(() => replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", active:true, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary", replenishment_policy:"factory" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", active:true, sort_order:99, name_zh_tw:"錯誤名稱", name_vi:"Tên sai", metadata:{ ui_key:"noodles", work_area:"noodles" } },
  ],
  workAreas:[{ code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true }],
}), /INVENTORY_WORK_LOCATION_PROJECTION_MISMATCH/,
"work locations must mirror Work Area display master data");

assert.throws(() => replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-storage", site:"branch-a", kind:"storage", active:true, name_zh_tw:"儲位", name_vi:"Kho", metadata:{ ui_key:"storage-a", storage_group:"primary" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", active:true, sort_order:10, name_zh_tw:"麵", name_vi:"Mì", metadata:{ ui_key:"noodles", work_area:"noodles" } },
  ],
  workAreas:[{ code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true }],
}), /INVENTORY_REPLENISHMENT_POLICY_REQUIRED/,
"storage locations must carry an explicit database replenishment policy");

const cloudSource = fs.readFileSync(new URL("../src/inventory-cloud.js", import.meta.url), "utf8");
for (const legacyName of ["FUXING_STORAGE_CODES", "YONGJI_STORAGE_CODES", "CENTRAL_ZONE_CODES", "BRANCH_STORAGE_CODES", "BRANCH_CODE_TO_ZONE"]) {
  assert.equal(cloudSource.includes(legacyName), false, `${legacyName} must not remain a production master-data source`);
}
assert.equal(/\bDEFAULT_ITEMS\b/.test(cloudSource), false, "production inventory cloud path must not use DEFAULT_ITEMS fallback");
assert.doesNotMatch(cloudSource, /WORK_AREAS\[0\]\?\.id/,
  "inventory hydration/catalog sync must not infer a work area from mutable global UI state");
assert.doesNotMatch(cloudSource, /\b(?:ZONES|WORK_AREAS|PRIMARY_ZONES)\.splice\(/,
  "inventory sync must not copy one site's PostgreSQL master data into legacy global arrays");
assert.doesNotMatch(cloudSource, /import \{[^}]*\b(?:ZONES|WORK_AREAS|PRIMARY_ZONES)\b[^}]*\} from "\.\/store\.js"/,
  "inventory cloud must not import legacy global storage/work-area arrays");
assert.doesNotMatch(cloudSource, /bootstrapFuxingInventory|bootstrapYongjiInventory|bootstrapCentralInventory/,
  "inventory startup must not expose site-specific bootstrap paths");
assert.doesNotMatch(cloudSource, /reconcileFuxingSnapshot|cloudSyncFuxingCatalogItem|cloudArchiveFuxingItem|fuxingLocationCode|fuxingWorkLocationCode|fuxingItemKey/,
  "inventory runtime must not expose Fuxing-only compatibility APIs");
const transferSource = fs.readFileSync(new URL("../src/inventory-transfer-service.js", import.meta.url), "utf8");
assert.match(transferSource, /workArea:\s*String\(row\.location\.metadata\?\.work_area \|\| ""\)\.trim\(\)/,
  "operation data must carry PostgreSQL work-area identity on work locations");
const operationSource = fs.readFileSync(new URL("../src/inventory-operations.js", import.meta.url), "utf8");
assert.match(operationSource, /function workLocationForItem[\s\S]{0,360}loc\.workArea[\s\S]{0,180}===workArea/,
  "pick operations must resolve the destination by database work-area identity");
assert.doesNotMatch(operationSource, /preferredSuffix|central-work-use|item\.workArea\|\|"noodles"|item\.workArea\s*\|\|\s*"noodles"/,
  "pick operations must not infer work locations from code suffixes, Central legacy 使用中, or a noodles fallback");
assert.match(operationSource, /workDestination:"Khu làm việc · 工作區"/,
  "operation UI must describe the destination as the configured work area");

const appSource = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
assert.doesNotMatch(appSource, /function appStagingLocations|function appWorkLocations|function branchDraftOperationData/,
  "retired browser-draft inventory helpers must not return as a second master-data path");
assert.doesNotMatch(appSource, /shitu-branch-inventory-draft-v1|shitu-inventory-operation-log-v1/,
  "branch inventory must not persist a browser-local business database");
assert.equal(appSource.includes('["central","fuxing","yongji"].flatMap'), false,
  "inventory helper paths must not hard-code the physical site registry");
assert.equal(appSource.includes('["fuxing","yongji"].includes(targetSite)'), false,
  "branch helper paths must accept database-declared branch sites");
assert.equal(appSource.includes('"central-freezer":"央廚冷凍"'), false,
  "Central storage labels must come from database master data");
assert.match(appSource, /const uiGroups = inventoryUiGroups\(site\);[\s\S]{0,180}uiGroups\.storage[\s\S]{0,100}uiGroups\.workAreas/,
  "branch inventory groups must render from the active site's PostgreSQL master-data snapshot");
assert.doesNotMatch(appSource, /function workAreaLabel[\s\S]{0,220}\|\| WORK_AREAS\.find/,
  "inventory work-area labels must not fall back to global source-coded work areas");
assert.match(appSource, /group\.storageGroup === "primary"/,
  "storage grouping must follow PostgreSQL metadata.storage_group instead of a fixed PRIMARY_ZONES list");
assert.match(appSource, /inventoryPrimaryStorageIds\(activeInventorySite\(\)\)/,
  "work inventory source summary must use database-declared primary storage locations");
assert.match(appSource, /name="unit" list="inventory-unit-suggestions" required/,
  "branch item unit must accept database-defined/free-form values instead of a closed source-code enum");
assert.doesNotMatch(appSource, /const units = \["盒", "包", "箱", "斤", "片", "個", "隻", "塊", "條", "kg"\]/,
  "branch inventory must not restore a fixed unit list");
assert.doesNotMatch(appSource, /\bZONES\b|ZONES\.find/,
  "branch inventory labels must not fall back to source-coded storage zones");
assert.doesNotMatch(appSource, /\{ central: "央廚", fuxing: "復興店", yongji: "永吉店" \}/,
  "settings branch label must not use a fixed Central/Fuxing/Yongji map");
assert.match(appSource, /const siteRow = inventorySite\(site\)[\s\S]{0,320}siteRow\?\.name_zh_tw/,
  "settings branch label must derive from the PostgreSQL-backed site registry");

const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const mobileCompat = fs.readFileSync(new URL("../src/mobile-browser-compat.css", import.meta.url), "utf8");
assert.match(styles, /\.setting-row \{[^}]*align-items: stretch;[^}]*flex-direction: column;[^}]*\}/,
  "base mobile settings rows must stack so database-provided site labels have enough width");
assert.match(mobileCompat, /\.setting-row\{[^}]*align-items:stretch !important;[^}]*flex-direction:column !important;[^}]*\}/,
  "last-loaded mobile compatibility layer must preserve stacked settings rows");
assert.match(mobileCompat, /\.setting-control>input\{[^}]*width:100% !important;[^}]*max-width:100% !important;[^}]*\}/,
  "last-loaded mobile compatibility layer must not restore a fixed settings input width");
assert.doesNotMatch(mobileCompat, /\.setting-control>input\{[^}]*width:96px !important/,
  "mobile compatibility layer must not clip database-provided site names to the legacy 96px input");
assert.doesNotMatch(appSource, /\["fuxing", "yongji"\]\.includes\(site\)/,
  "branch inventory authority must use database-declared inventory_mode");
assert.match(appSource, /const primary = groups\.filter\(\(group\) => group\.storageGroup === "primary"\);[\s\S]{0,160}const service = groups\.filter\(\(group\) => group\.storageGroup === "service"\);/,
  "Fuxing/Yongji storage tabs must classify primary/service explicitly from PostgreSQL");
assert.match(appSource, /function authoritativeBranchRecord[\s\S]{0,700}inventoryBranchSnapshot\(site\)[\s\S]{0,320}inventory:\[\], workInventory:\[\]/,
  "branch dashboard/runtime must use a site-scoped PostgreSQL snapshot or empty inventory, never source-seeded stock");

const authLayer = fs.readFileSync(new URL("../src/auth-layer.js", import.meta.url), "utf8");
assert.match(authLayer, /function branchSwitcher[\s\S]{0,700}inventorySites\(\)\.filter/,
  "warehouse switcher must derive active physical sites from PostgreSQL master data");
assert.doesNotMatch(authLayer, /data-warehouse="fuxing"[\s\S]{0,240}data-warehouse="yongji"/,
  "warehouse switcher must not hard-code branch buttons");
assert.doesNotMatch(authLayer, /user\.location === "central" \? "央廚"[\s\S]{0,180}user\.location === "fuxing"/,
  "authenticated account site labels must come from the PostgreSQL site registry");
assert.doesNotMatch(authLayer, /領到使用中|Lấy từ kho trung tâm vào 使用中/,
  "Central pick guidance must not describe the retired generic 使用中 location");
assert.match(authLayer, /const workAreaId=item\.workArea\|\|centralDefaultWorkArea\(\);[\s\S]{0,900}centralWorkAreaLabel\(workAreaId,language\)/,
  "Central work inventory must display the PostgreSQL work-area identity instead of a generic work-location label");
assert.match(authLayer, /renderClass\("primary","主要儲位","Kho tổng · 主要儲位"\)[\s\S]{0,160}renderClass\("service","區域儲位","Kho khu vực · 區域儲位"\)/,
  "Central storage overview must visibly separate primary and service database storage");
assert.match(authLayer, /const centralPrimary = centralStorage\.filter\(\(group\)=>group\.storageGroup==="primary"\);[\s\S]{0,220}const centralService = centralStorage\.filter\(\(group\)=>group\.storageGroup==="service"\);/,
  "Central storage tabs must classify locations explicitly from database storage_group");
assert.doesNotMatch(authLayer, /data-central-zone="央廚冷凍"/,
  "Central storage identity must not be a hard-coded display label");
assert.match(authLayer, /const workAreaId=item\.workArea\|\|centralDefaultWorkArea\(\);[\s\S]{0,900}centralWorkAreaLabel\(workAreaId,language\)/,
  "Central work inventory must display the PostgreSQL work-area identity instead of a generic work-location label");
assert.doesNotMatch(authLayer, /data-central-zone="央廚冷凍"/,
  "Central storage filtering must not hard-code a display label as location identity");
assert.match(authLayer, /const centralDefaultWorkArea = \(\) => centralWorkAreas\(\)\[0\]\?\.id \|\| "";/,
  "Central work-area defaults must come from PostgreSQL master data");
assert.match(authLayer, /name="central-unit" list="central-unit-suggestions" required/,
  "Central item unit must accept database-defined/free-form values");
assert.doesNotMatch(authLayer, /CENTRAL_UNITS|central-work-use|\|\| "noodles"/,
  "Central inventory must not restore fixed unit/work-area/location fallbacks");
assert.match(authLayer, /const defaultZone = zones\[0\] \|\| "";/,
  "new Central items must default to the first database-declared storage location");
assert.match(authLayer, /centralZones\(\)\.map\(\(zone\) => `<button data-central-zone=[\s\S]{0,240}centralZoneLabel\(zone, language\)/,
  "Central management tabs must render current PostgreSQL location labels rather than raw UI keys");

const adminSource = fs.readFileSync(new URL("../src/admin-panel.js", import.meta.url), "utf8");
assert.equal(/const\s+SITES\s*=/.test(adminSource), false, "Admin Panel site list must come from PostgreSQL");
assert.equal(/SITE_LABELS/.test(adminSource), false, "Admin Panel site labels must come from PostgreSQL");

const accountAdmin = fs.readFileSync(new URL("../src/account-admin.js", import.meta.url), "utf8");
assert.match(accountAdmin, /vpsInventorySites/,
  "account editor must load site choices from PostgreSQL");
assert.match(accountAdmin, /\/api\/admin\/access-model/,
  "account editor must load role choices from the database access model");
assert.equal(accountAdmin.includes('<option value="fuxing"'), false,
  "account editor must not hard-code Fuxing as a location option");
assert.equal(accountAdmin.includes('<option value="yongji"'), false,
  "account editor must not hard-code Yongji as a location option");
assert.equal(accountAdmin.includes("location:'fuxing'"), false,
  "new accounts must not default to a hard-coded branch");
assert.equal(accountAdmin.includes("['admin','manager','supervisor','employee','parttime','central']"), false,
  "account editor role choices must come from the database access model");

const authBridge = fs.readFileSync(new URL("../src/vps-auth-bridge.js", import.meta.url), "utf8");
assert.equal(authBridge.includes('["central", "fuxing", "yongji"].includes(normalized.location)'), false,
  "auth session must accept any backend-authorized site");
assert.equal(authBridge.includes('user.location || "fuxing"'), false,
  "auth session must not fall back to Fuxing");
assert.equal(authBridge.includes('data.get("location") || "fuxing"'), false,
  "account submissions must not invent a Fuxing location");
assert.match(authBridge, /normalized\.location && normalized\.location !== "all"/,
  "site-scoped sessions must mirror the backend-authorized site dynamically");

const adminRoutes = fs.readFileSync(new URL("../vps/backend/src/admin-routes.mjs", import.meta.url), "utf8");
assert.equal(adminRoutes.includes("VALID_LOCATIONS"), false, "account site validation must not use a closed JS enum");
assert.equal(adminRoutes.includes('["fuxing","yongji"].includes(location)'), false, "assigned account roles must not hard-code branch names");
assert.match(adminRoutes, /activeSite\(effectiveLocation, client\)/, "account site validation must resolve through PostgreSQL sites");
assert.equal(adminRoutes.includes('inventory_mode || "") !== "branch"'), false,
  "assigned account roles must allow Central as an active site");

const accessControl = fs.readFileSync(new URL("../vps/backend/src/access-control.mjs", import.meta.url), "utf8");
assert.equal(accessControl.includes('scope_policy === "central" ? "central"'), false, "access model must not choose a hard-coded sample site");
assert.equal(accessControl.includes(': "fuxing"'), false, "access model must not require Fuxing to resolve role permissions");

const migration = fs.readFileSync(new URL("../vps/database/migrations/016_inventory_ui_master_data.sql", import.meta.url), "utf8");
assert.match(migration, /inventory_mode/);
assert.match(migration, /ui_key/);
assert.match(migration, /storage_group/);
assert.match(migration, /work_area/);

const classificationMigration = fs.readFileSync(new URL("../vps/database/migrations/025_inventory_location_workarea_unification.sql", import.meta.url), "utf8");
assert.match(classificationMigration, /inventory_location_classification_guard/);
assert.match(classificationMigration, /sync_work_area_inventory_location/);
assert.match(classificationMigration, /WORK_AREA_LOCATION_CARDINALITY_INVALID/);
assert.match(classificationMigration, /WORK_STOCK_AREA_MISMATCH/);
assert.match(classificationMigration, /central-work-use/);
assert.match(classificationMigration, /target\.metadata->>'work_area'=i\.work_area/);

const branchWorkAreaSyncMigration = fs.readFileSync(new URL("../vps/database/migrations/026_branch_catalog_workarea_sync.sql", import.meta.url), "utf8");
assert.match(branchWorkAreaSyncMigration, /inventory_mode',''\)='central'/,
  "branch work-area normalization must derive its canonical source from database site metadata");
assert.match(branchWorkAreaSyncMigration, /inventory_mode',''\)='branch'/,
  "branch work-area normalization must discover branches from database site metadata");
assert.match(branchWorkAreaSyncMigration, /join central_catalog c using\(catalog_key\)/,
  "same catalog identity must drive Central-to-branch work-area normalization");
assert.match(branchWorkAreaSyncMigration, /public\.inventory_stock[\s\S]{0,900}target_location_id/,
  "work-area normalization must move existing branch work stock to the target database location");
assert.match(branchWorkAreaSyncMigration, /BRANCH_WORK_AREA_SYNC_QUANTITY_CHANGED/,
  "migration must prove work quantity is unchanged");
assert.match(branchWorkAreaSyncMigration, /system_inventory_catalog_work_area_sync/,
  "migration must audit each corrected item");
assert.match(branchWorkAreaSyncMigration, /BRANCH_CATALOG_WORK_AREA_MISMATCH/,
  "migration must stop if Central/branch classification remains divergent");

const legacyBranchCatalogMigration = fs.readFileSync(new URL("../vps/database/migrations/027_branch_legacy_catalog_materialization.sql", import.meta.url), "utf8");
assert.match(legacyBranchCatalogMigration, /legacy_branch_catalog/,
  "legacy branch product identities must be materialized in PostgreSQL");
assert.match(legacyBranchCatalogMigration, /metadata->>'work_area'=i\.work_area/,
  "every active branch item must project into its database work area");
assert.doesNotMatch(legacyBranchCatalogMigration, /i\.storage_only=false/,
  "storage_only branch items must not disappear from the work-area projection");
assert.match(legacyBranchCatalogMigration, /BRANCH_ITEM_WORK_PROJECTION_INCOMPLETE/,
  "migration must stop if a branch product is still missing its work projection");

assert.match(appSource, /function inventoryDistinctItemCount\([\s\S]{0,220}stockKey/,
  "inventory product badges must count unique products instead of storage-location rows");
assert.match(appSource, /groupKey === "zone" \? inventoryDistinctItemCount\(entries\) : entries\.length/,
  "all-storage tab must compare product identities with the work-area product count");

const inventoryDatabaseSource2 = fs.readFileSync(new URL("../src/admin-inventory-database.js", import.meta.url), "utf8");
assert.match(inventoryDatabaseSource2, /missingWorkStock/,
  "Super Admin integrity must surface products missing their work-area projection");

const superAdminRoutesSource = fs.readFileSync(new URL("../vps/backend/src/super-admin-routes.mjs", import.meta.url), "utf8");
assert.match(superAdminRoutesSource, /workAreaMismatchesWithCentral/,
  "Super Admin catalog audit must expose Central-to-branch work-area drift");
assert.match(superAdminRoutesSource, /centralWorkArea/,
  "cross-site work-area audit must include the canonical Central area");

const inventoryDatabaseSource = fs.readFileSync(new URL("../src/admin-inventory-database.js", import.meta.url), "utf8");
assert.match(inventoryDatabaseSource, /crossSiteWorkArea/,
  "Super Admin Database integrity view must show cross-site work-area drift");
assert.match(inventoryDatabaseSource, /\/api\/admin\/super\/inventory-catalog-audit/,
  "Super Admin Database integrity view must load the cross-site catalog audit");

const productionAuditSource = fs.readFileSync(new URL("../.github/workflows/inventory-site-production-audit.yml", import.meta.url), "utf8");
assert.match(productionAuditSource, /catalog_work_area_mismatch_with_central/,
  "production audit must report Central-to-branch work-area drift");
assert.match(productionAuditSource, /detail_work_area_drift/,
  "production audit must print exact drift details");
assert.match(productionAuditSource, /'work_area\|' \|\| split_part\(i\.item_key,':',1\)[\s\S]{0,220}'\|items\|' \|\| count\(\*\)/,
  "production audit must report per-site work-area item counts for post-deploy verification");

const dynamicSiteMigration = fs.readFileSync(new URL("../vps/database/migrations/017_dynamic_site_scope.sql", import.meta.url), "utf8");
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_locations_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_receive_defaults_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists app_users_location_check/);
assert.match(dynamicSiteMigration, /APP_USER_SITE_NOT_FOUND/);
assert.match(dynamicSiteMigration, /from public\.sites/);

const rulesSource = fs.readFileSync(new URL("../src/rules-core.js", import.meta.url), "utf8");
assert.doesNotMatch(rulesSource, /const SOURCE_PRIORITY|destination === "large-fridge"|destination === "four-door"|\["large-fridge", "large-freezer"\]/,
  "inventory replenishment routing must not restore legacy location-id hard-code");

console.log("INVENTORY_MASTER_DATA_REGRESSION_OK");
