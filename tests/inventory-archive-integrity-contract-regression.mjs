import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const migration=read("vps/database/migrations/023_inventory_archive_integrity.sql");
const backend=read("vps/backend/src/inventory-extra-routes.mjs");
const app=read("src/app.js");
const verifier=read("vps/scripts/verify-vps-data.sh");
const auditWorkflow=read(".github/workflows/inventory-site-production-audit.yml");

assert.match(
  migration,
  /where i\.active=false[\s\S]{0,120}\(s\.quantity>0 or s\.minimum_quantity>0\)/,
  "migration 023 must recover hidden quantity or minimum configuration"
);
assert.match(migration,/system_inventory_hidden_stock_reactivate/);
assert.match(migration,/create trigger inventory_items_archive_guard/);
assert.match(migration,/message='ITEM_HAS_STOCK'/);
assert.match(migration,/create trigger inventory_stock_active_item_guard/);
assert.match(migration,/message='INVENTORY_STOCK_ITEM_INACTIVE'/);

assert.match(
  backend,
  /app\.post\("\/api\/inventory\/catalog\/archive"[\s\S]*?withTransaction\(async \(client\) =>/,
  "catalog archive must be transactional"
);
assert.match(
  backend,
  /protectedRows[\s\S]*?ITEM_HAS_STOCK/,
  "catalog archive must reject protected stock/config before hiding the item"
);
assert.match(
  backend,
  /delete from public\.inventory_stock[\s\S]*?update public\.inventory_items[\s\S]*?active=false/,
  "successful archive must remove only zero-stock configuration before hiding the item"
);
assert.match(
  backend,
  /inventory_catalog_archive/,
  "successful catalog archive must be audit logged"
);

assert.match(
  app,
  /result\.error\?\.message === "ITEM_HAS_STOCK"/,
  "frontend must retain explicit stock-bearing archive feedback"
);

assert.match(verifier,/inactive inventory items with positive quantity/);
assert.match(verifier,/inactive inventory items with positive minimum/);
assert.match(verifier,/inventory archive-integrity triggers = 2/);
assert.match(verifier,/schema version \$\{schema\} is older than 024/);

assert.match(
  auditWorkflow,
  /Enforce zero hidden inventory after deploy[\s\S]*?inventory_hidden_integrity_violations/,
  "post-deploy inventory audit must enforce hidden-stock integrity"
);
assert.match(
  auditWorkflow,
  /if: github\.event_name == 'workflow_run'/,
  "hidden-stock enforcement must wait for the successful deploy-triggered audit"
);

console.log("INVENTORY_ARCHIVE_INTEGRITY_CONTRACT_OK");
