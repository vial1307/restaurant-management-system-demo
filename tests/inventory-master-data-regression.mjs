import assert from "node:assert/strict";
import fs from "node:fs";
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
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", sort_order:10, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary" } },
    { code:"branch-a-kitchen", site:"branch-a", kind:"storage", sort_order:20, name_zh_tw:"廚房冰箱", name_vi:"Tủ bếp", metadata:{ ui_key:"kitchen", storage_group:"service" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", sort_order:30, name_zh_tw:"麵台使用中", name_vi:"Khu mì đang dùng", metadata:{ ui_key:"noodles", work_area:"noodles" } },
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
assert.deepEqual(groups.workAreas.map((entry) => entry.id), ["noodles"]);

assert.throws(() => replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", active:true, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", active:true, sort_order:10, name_zh_tw:"麵", name_vi:"Mì", metadata:{ ui_key:"noodles", work_area:"noodles", storage_group:"service" } },
  ],
  workAreas:[{ code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true }],
}), /INVENTORY_WORK_LOCATION_STORAGE_GROUP_FORBIDDEN/,
"work locations must never carry storage classification");

assert.throws(() => replaceInventoryMasterSnapshot("branch-a", {
  site:{ code:"branch-a", metadata:{ inventory_mode:"branch" } },
  locations:[
    { code:"branch-a-freezer", site:"branch-a", kind:"storage", active:true, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary" } },
    { code:"branch-a-work-noodles", site:"branch-a", kind:"work", active:true, sort_order:99, name_zh_tw:"錯誤名稱", name_vi:"Tên sai", metadata:{ ui_key:"noodles", work_area:"noodles" } },
  ],
  workAreas:[{ code:"noodles", name_zh_tw:"麵", name_vi:"Mì", sort_order:10, active:true }],
}), /INVENTORY_WORK_LOCATION_PROJECTION_MISMATCH/,
"work locations must mirror Work Area display master data");

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
assert.match(appSource, /function authoritativeBranchRecord[\s\S]{0,700}inventoryBranchSnapshot\(site\)[\s\S]{0,320}inventory:\[\], workInventory:\[\]/,
  "branch dashboard/runtime must use a site-scoped PostgreSQL snapshot or empty inventory, never source-seeded stock");

const authLayer = fs.readFileSync(new URL("../src/auth-layer.js", import.meta.url), "utf8");
assert.match(authLayer, /function branchSwitcher[\s\S]{0,700}inventorySites\(\)\.filter/,
  "warehouse switcher must derive active physical sites from PostgreSQL master data");
assert.doesNotMatch(authLayer, /data-warehouse="fuxing"[\s\S]{0,240}data-warehouse="yongji"/,
  "warehouse switcher must not hard-code branch buttons");
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

const dynamicSiteMigration = fs.readFileSync(new URL("../vps/database/migrations/017_dynamic_site_scope.sql", import.meta.url), "utf8");
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_locations_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_receive_defaults_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists app_users_location_check/);
assert.match(dynamicSiteMigration, /APP_USER_SITE_NOT_FOUND/);
assert.match(dynamicSiteMigration, /from public\.sites/);

console.log("INVENTORY_MASTER_DATA_REGRESSION_OK");
