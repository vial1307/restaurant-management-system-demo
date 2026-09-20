import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const source=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");
const app=source("src/app.js");
const auth=source("src/auth-layer.js");
const cloud=source("src/inventory-cloud.js");
const api=source("src/vps-api.js");
const backend=source("vps/backend/src/inventory-extra-routes.mjs");

assert.match(
  backend,
  /app\.post\("\/api\/inventory\/relocate-work-area"[\s\S]*?withTransaction[\s\S]*?pg_advisory_xact_lock/,
  "work-area relocation must be serialized in a PostgreSQL transaction"
);
assert.match(
  backend,
  /relocate-work-area[\s\S]*?s\.kind='work'[\s\S]*?d\.kind='work'[\s\S]*?update public\.inventory_items set work_area=\$2/,
  "work-area relocation must validate work locations and persist item metadata"
);
assert.match(
  backend,
  /inventory_work_area_relocate[\s\S]*?source_minimum[\s\S]*?destination_minimum_after/,
  "work-area relocation must preserve and audit quantity/minimum state"
);
assert.match(api,/vpsRelocateWorkArea[\s\S]*?\/api\/inventory\/relocate-work-area/);
assert.match(cloud,/cloudRelocateWorkArea[\s\S]*?vpsRelocateWorkArea[\s\S]*?syncInventoryNow/);
assert.match(
  app,
  /key === "workArea"[\s\S]*?cloudRelocateWorkArea/,
  "inline work-area edits must use the database relocation endpoint"
);
assert.match(
  app,
  /const state = store\.getState\(\);[\s\S]*?\["add-item", "edit-item"\]/,
  "inventory item submit must read a defined current store snapshot"
);
assert.match(
  app,
  /function queueBranchQuickAdjustment[\s\S]*?queuedDelta \+= actualDelta[\s\S]*?QUICK_ADJUST_DEBOUNCE_MS/,
  "branch +/- taps must be coalesced instead of rendering per tap"
);
assert.match(
  app,
  /function flushBranchQuickAdjustment[\s\S]*?cloudAdjustQuantity\([\s\S]*?sync:false[\s\S]*?syncInventoryNow/,
  "branch quick adjustment must write a delta and reconcile once"
);
const branchAdjustBlock=app.slice(app.indexOf('if (action === "adjust-item")'),app.indexOf('if (action === "adjust-work-item")'));
const cloudBranchAdjustBlock=branchAdjustBlock.slice(branchAdjustBlock.indexOf("const manageAdjust"));
assert.doesNotMatch(cloudBranchAdjustBlock,/store\.updateItem|render\(\)/,"cloud-backed branch +/- must not trigger a whole-page store render");

assert.match(
  auth,
  /function queueCentralQuickAdjustment[\s\S]*?queuedDelta\+=actualDelta[\s\S]*?CENTRAL_QUICK_ADJUST_DEBOUNCE_MS/,
  "central +/- taps must be coalesced"
);
assert.match(
  auth,
  /\[data-central-step\][\s\S]*?queueCentralQuickAdjustment/,
  "central +/- controls must use the quick adjustment queue"
);
const centralStepHandler=auth.slice(
  auth.indexOf('content.querySelectorAll("[data-central-step]")'),
  auth.indexOf('content.querySelectorAll("input[data-central-set-qty]',auth.indexOf('content.querySelectorAll("[data-central-step]")'))
);
assert.doesNotMatch(
  centralStepHandler,
  /commitCentralQuantity/,
  "central +/- must not perform a full set-and-reload on every tap"
);
assert.match(
  auth,
  /cloudSyncCentralCatalogItem\(itemKey,nextItems,\{sync:false\}\)[\s\S]*?cloudSetQuantity[\s\S]*?cloudSetMinimum[\s\S]*?syncInventoryNow/,
  "central product edits must persist catalog, quantity and minimum before authoritative reconciliation"
);

console.log("inventory edit round-trip/performance contract regression passed");
