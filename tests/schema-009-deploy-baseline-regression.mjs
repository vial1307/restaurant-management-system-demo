import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const migrationUrl = new URL("vps/database/migrations/009_fuxing_large_freezer_authoritative_reconcile_20260911.sql", root);
const migrateUrl = new URL("vps/scripts/migrate.sh", root);
const verifyUrl = new URL("vps/scripts/verify-vps-data.sh", root);

assert.equal(fs.existsSync(migrationUrl), true, "production migration 009 must exist in the canonical repository");

const migrate = fs.readFileSync(migrateUrl, "utf8");
const verify = fs.readFileSync(verifyUrl, "utf8");

assert.match(migrate, /create table if not exists public\.schema_migrations/i, "migration runner must keep a persistent migration ledger");
assert.match(migrate, /select 1 from public\.schema_migrations where version=/i, "migration runner must skip already-applied versions");
assert.match(verify, /if \[\[ "\$\{schema\}" < "009" \]\]; then/, "production verifier must reject schemas older than 009");
assert.match(verify, /older than 009/, "production verifier must identify schema 009 as the minimum");
assert.match(verify, /Fuxing large-freezer authoritative 51-row reconciliation/, "production verifier must check the authoritative 51-row stocktake");
assert.match(verify, /code='fuxing-large-freezer'.*site='fuxing'.*kind='storage'/s, "production verifier must bind the stocktake to canonical Fuxing 大冷凍");

const expectedRows = [...verify.matchAll(/\('fuxing:[^']+',\s*\d+(?:::numeric)?,\s*'[^']+'\)/g)];
assert.equal(expectedRows.length, 51, `production verifier must contain 51 exact expected item rows, got ${expectedRows.length}`);
assert.match(verify, /s\.quantity is distinct from e\.expected_quantity/, "production verifier must reject quantity mismatches");
assert.match(verify, /i\.unit is distinct from e\.expected_unit/, "production verifier must reject unit mismatches");
assert.match(verify, /i\.active=true and i\.storage_only=true/, "production verifier must reject inactive/non-storage-only master rows");

console.log("SCHEMA_009_DEPLOY_BASELINE_OK");
