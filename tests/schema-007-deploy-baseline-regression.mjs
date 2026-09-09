import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("vps/database/migrations/007_fuxing_large_freezer_stocktake_20260909.sql", root);
const migrateUrl = new URL("vps/scripts/migrate.sh", root);
const verifyUrl = new URL("vps/scripts/verify-vps-data.sh", root);

assert.equal(fs.existsSync(migrationUrl), true, "production migration 007 must remain in the canonical repository");

const migrate = fs.readFileSync(migrateUrl, "utf8");
const verify = fs.readFileSync(verifyUrl, "utf8");

assert.match(migrate, /create table if not exists public\.schema_migrations/i, "migration runner must keep a persistent migration ledger");
assert.match(migrate, /select 1 from public\.schema_migrations where version=/i, "migration runner must check whether a version was already applied");
assert.match(migrate, /if \[\[ "\$\{applied\}" == "1" \]\]; then[\s\S]*?skip \$\{base\}/, "applied migrations must be skipped instead of re-running one-time data imports");

assert.match(verify, /if \[\[ "\$\{schema\}" < "007" \]\]; then/, "production verifier must reject schemas older than 007");
assert.match(verify, /older than 007/, "production verifier error text must identify schema 007 as the minimum");
assert.doesNotMatch(verify, /schema version \$\{schema\} is older than 006/, "stale schema 006 production baseline must not return");

console.log("SCHEMA_007_DEPLOY_BASELINE_OK");
