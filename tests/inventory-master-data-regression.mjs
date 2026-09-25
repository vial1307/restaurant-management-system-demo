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

const cloudSource = fs.readFileSync(new URL("../src/inventory-cloud.js", import.meta.url), "utf8");
for (const legacyName of ["FUXING_STORAGE_CODES", "YONGJI_STORAGE_CODES", "CENTRAL_ZONE_CODES", "BRANCH_STORAGE_CODES", "BRANCH_CODE_TO_ZONE"]) {
  assert.equal(cloudSource.includes(legacyName), false, `${legacyName} must not remain a production master-data source`);
}
assert.equal(/\bDEFAULT_ITEMS\b/.test(cloudSource), false, "production inventory cloud path must not use DEFAULT_ITEMS fallback");

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

const dynamicSiteMigration = fs.readFileSync(new URL("../vps/database/migrations/017_dynamic_site_scope.sql", import.meta.url), "utf8");
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_locations_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists inventory_receive_defaults_site_check/);
assert.match(dynamicSiteMigration, /drop constraint if exists app_users_location_check/);
assert.match(dynamicSiteMigration, /APP_USER_SITE_NOT_FOUND/);
assert.match(dynamicSiteMigration, /from public\.sites/);

console.log("INVENTORY_MASTER_DATA_REGRESSION_OK");
