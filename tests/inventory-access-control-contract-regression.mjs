import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("vps/database/migrations/032_inventory_access_and_catalog_master.sql","utf8");
const evaluator=fs.readFileSync("vps/backend/src/inventory-access.mjs","utf8");
const adminRoutes=fs.readFileSync("vps/backend/src/inventory-access-admin-routes.mjs","utf8");
const extraRoutes=fs.readFileSync("vps/backend/src/inventory-extra-routes.mjs","utf8");
const server=fs.readFileSync("vps/backend/src/server.mjs","utf8");
const adminUi=fs.readFileSync("src/admin-inventory-permissions.js","utf8");
const adminPanel=fs.readFileSync("src/admin-panel.js","utf8");

for(const table of [
  "inventory_permission_actions",
  "inventory_access_policies",
  "inventory_policy_actions",
  "inventory_user_policy_assignments",
  "inventory_access_rules",
  "inventory_access_rule_sites",
  "inventory_access_rule_locations",
  "inventory_access_rule_work_areas",
  "inventory_site_groups",
  "inventory_site_group_members",
  "inventory_access_subject_revisions",
  "inventory_categories",
  "inventory_units",
  "inventory_item_locations",
]){
  assert.match(migration,new RegExp(`create table if not exists public\\.${table}\\b`),`${table} missing from schema 032`);
}

assert.match(migration,/inventory\.quantity\.adjust_quick/);
assert.match(migration,/inventory\.quantity\.set_absolute/);
assert.match(migration,/inventory\.transfer\.cross_site/);
assert.match(migration,/inventory\.product\.unit\.edit/);
assert.match(migration,/inventory\.product\.category\.edit/);
assert.match(migration,/inventory\.product\.primary_location\.edit/);
assert.match(migration,/inventory\.receive_default\.edit/);
assert.match(migration,/inventory_access_rule_sites/);
assert.doesNotMatch(migration,/\bAB\b|\bAC\b|\bBC\b/,"site combinations must be normalized DB rows, not coded presets");
assert.match(migration,/minimum_enabled/);
assert.match(migration,/warning_enabled/);
assert.match(migration,/warning_quantity/);
assert.match(migration,/is_primary/);
assert.match(migration,/display_order/);
assert.match(migration,/MIGRATION_032_COMPAT_SEED/);

assert.doesNotMatch(evaluator,/user\?\.role|user\.role|hasPermission|siteAllowed/,"Inventory evaluator must not derive authority from role");
assert.match(evaluator,/NO_MATCHING_RULE/);
assert.match(evaluator,/DIRECT_DENY/);
assert.match(evaluator,/POLICY_DENY/);
assert.match(evaluator,/locationMatch \? 400 : 350/);
assert.match(adminRoutes,/INVENTORY_ACCESS_STALE/);
assert.match(adminRoutes,/inventory_access_replace/);
assert.match(adminRoutes,/inventory_access_subject_revisions/);

assert.doesNotMatch(extraRoutes,/user\.role\s*!==\s*["']admin["']/,"catalog archive must not be job-title hard-coded");
assert.doesNotMatch(extraRoutes,/hasPermission\(user,\s*["']inventory["']/,"Inventory extra routes must use granular DB actions");
assert.match(extraRoutes,/inventory\.product\.archive/);
assert.match(extraRoutes,/inventory\.receive_default\.edit/);
assert.match(extraRoutes,/inventory\.product\.location\.detach/);
assert.match(server,/inventory\.quantity\.adjust_quick/);
assert.match(server,/inventory\.transfer\.internal/);
assert.match(server,/inventory\.history\.full/);

assert.match(adminUi,/Toàn bộ hoặc bất kỳ tổ hợp A\+B, A\+C, A\+D, B\+C/);
assert.match(adminUi,/DB AUTHORITY/);
assert.match(adminUi,/data-inv-builder-location/);
assert.match(adminUi,/data-inv-builder-area/);
assert.match(adminUi,/SUPER_ADMIN_OVERRIDE/);
assert.match(adminUi,/revision/);
assert.match(adminPanel,/createInventoryPermissionAdmin/);
assert.match(adminPanel,/data-inventory-permission-admin/);

console.log("INVENTORY_ACCESS_CONTROL_CONTRACT_OK");
