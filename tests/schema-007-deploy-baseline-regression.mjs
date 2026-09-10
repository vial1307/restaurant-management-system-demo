import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("vps/database/migrations/007_fuxing_large_freezer_stocktake_20260909.sql", root);
const migrateUrl = new URL("vps/scripts/migrate.sh", root);

assert.equal(fs.existsSync(migrationUrl), true, "production migration 007 must remain in the canonical repository");

const migrate = fs.readFileSync(migrateUrl, "utf8");
assert.match(migrate, /create table if not exists public\.schema_migrations/i, "migration runner must keep a persistent migration ledger");
assert.match(migrate, /select 1 from public\.schema_migrations where version=/i, "migration runner must check whether a version was already applied");
assert.match(migrate, /if \[\[ "\$\{applied\}" == "1" \]\]; then[\s\S]*?skip \$\{base\}/, "applied historical migrations must be skipped instead of re-running one-time imports");

console.log("SCHEMA_007_HISTORY_GUARD_OK");
