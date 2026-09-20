import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const stocktakeMigrationUrl = new URL("vps/database/migrations/008_fuxing_large_freezer_stocktake_20260910.sql", root);
const currentMigrationUrl = new URL("vps/database/migrations/025_inventory_units_and_editor_master_data.sql", root);
const migrateUrl = new URL("vps/scripts/migrate.sh", root);
const verifyUrl = new URL("vps/scripts/verify-vps-data.sh", root);
const backendScriptsUrl = new URL("vps/backend/scripts/", root);

assert.equal(fs.existsSync(stocktakeMigrationUrl), true, "production migration 008 must remain in the canonical repository");
assert.equal(fs.existsSync(currentMigrationUrl), true, "current production migration 025 must exist in the canonical repository");

const migrate = fs.readFileSync(migrateUrl, "utf8");
const verify = fs.readFileSync(verifyUrl, "utf8");

assert.match(migrate, /create table if not exists public\.schema_migrations/i, "migration runner must keep a persistent migration ledger");
assert.match(migrate, /select 1 from public\.schema_migrations where version=/i, "migration runner must check whether a version was already applied");
assert.match(migrate, /if \[\[ "\$\{applied\}" == "1" \]\]; then[\s\S]*?skip \$\{base\}/, "applied migrations must be skipped instead of re-running one-time migrations");

assert.match(verify, /if \[\[ "\$\{schema\}" < "025" \]\]; then/, "production verifier must reject schemas older than 025");
assert.match(verify, /older than 025/, "production verifier error text must identify schema 024 as the minimum");
assert.doesNotMatch(verify, /if \[\[ "\$\{schema\}" < "00[78]" \]\]; then/, "stale pre-Core-v2 production baseline must not return");

const backendScripts = fs.readdirSync(backendScriptsUrl)
  .filter((name) => name.endsWith(".mjs"))
  .map((name) => fs.readFileSync(new URL(name, backendScriptsUrl), "utf8"))
  .join("\n");
assert.doesNotMatch(
  backendScripts,
  /(?:health\.data\.schema|schema\.rows\[0\]\?\.version)[^\n]{0,100}["']02[0-4]["']/,
  "runtime/backend regression wrappers must not pin retired schemas 020/021/022/023/024"
);

console.log("SCHEMA_025_DEPLOY_BASELINE_OK");
