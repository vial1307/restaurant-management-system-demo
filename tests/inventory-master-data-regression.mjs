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

const migration = fs.readFileSync(new URL("../vps/database/migrations/016_inventory_ui_master_data.sql", import.meta.url), "utf8");
assert.match(migration, /inventory_mode/);
assert.match(migration, /ui_key/);
assert.match(migration, /storage_group/);
assert.match(migration, /work_area/);

console.log("INVENTORY_MASTER_DATA_REGRESSION_OK");
