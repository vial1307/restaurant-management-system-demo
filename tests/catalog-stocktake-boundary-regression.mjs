import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const app = source("src/app.js");
const cloud = source("src/inventory-cloud.js");
const backend = source("vps/backend/src/inventory-extra-routes.mjs");

assert.match(
  app,
  /manageQuantityEdit:canDirectInventoryAdjust\(\)/,
  "Manage tab must derive direct quantity editing from the effective inventory edit contract"
);
assert.match(
  app,
  /element\.dataset\.manageAdjust === "true" && canManageBranchCatalog\(activeInventorySite\(\)\) && canDirectInventoryAdjust\(\)/,
  "quantity change handler must retain both catalog access and effective inventory edit guards"
);
assert.match(
  app,
  /const stocktakeEditable = canDirectInventoryAdjust\(\);/,
  "product modal must derive stock fields from the effective inventory edit guard"
);
assert.match(
  app,
  /name="quantity:\$\{zone\.id\}"[^>]+readonly aria-readonly=/,
  "accounts without direct inventory edit permission must see quantity as read-only"
);
assert.match(
  app,
  /name="minimum:\$\{zone\.id\}"[^>]+readonly aria-readonly=/,
  "accounts without direct inventory edit permission must see minimum as read-only"
);

assert.match(
  cloud,
  /if \(!canDirectInventoryAdjust\(\)\) return \{ ok: false, fallback: false, error: new Error\("DIRECT_ADJUST_NOT_ALLOWED"\) \};/,
  "frontend VPS set-quantity wrapper must enforce the effective edit/site contract"
);
assert.doesNotMatch(
  cloud,
  /\["manager","supervisor"\]/,
  "frontend direct inventory controls must not reintroduce a manager/supervisor-only role gate"
);

assert.match(
  backend,
  /if \(!requireInventory\(user, row\.site, "edit", reply\)\) \{/,
  "set-quantity must authorize with inventory.edit plus site scope"
);
assert.match(
  backend,
  /if \(!requireInventory\(user,row\.site,"edit",reply\)\) return;/,
  "set-minimum must authorize with inventory.edit plus site scope"
);
assert.match(
  backend,
  /const stocktakeWrite = siteAllowed\(user,site\) && hasPermission\(user,"inventory","edit"\);/,
  "catalog sync must compute quantity/minimum write authority from effective permission and site scope"
);
assert.doesNotMatch(
  backend,
  /STOCKTAKE_ROLE_REQUIRED|canStocktakeRole/,
  "legacy role-only stocktake boundary must remain removed"
);

console.log("catalog inventory edit boundary regression passed");
