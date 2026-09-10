import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prior = fs.readFileSync(path.join(root, "vps/database/migrations/008_fuxing_large_freezer_stocktake_20260910.sql"), "utf8");
const migration = fs.readFileSync(path.join(root, "vps/database/migrations/009_fuxing_large_freezer_reconcile_20260911.sql"), "utf8");

function parseRows(source) {
  const rows = new Map();
  for (const match of source.matchAll(/\('([^']+)',([0-9]+)(?:::numeric)?,'([^']*)'\)/g)) {
    rows.set(match[1], { quantity: Number(match[2]), rawDetail: match[3] });
  }
  return rows;
}

const expected = parseRows(prior);
const actual = parseRows(migration);
assert.equal(expected.size, 51, "migration 008 reference must contain the 51 supplied rows");
assert.equal(actual.size, 51, "reconciliation must contain exactly the same 51 supplied rows");
assert.deepEqual(actual, expected, "reconciliation quantities/raw details must exactly match the authoritative user snapshot");

assert.match(migration, /code='fuxing-large-freezer'/, "reconciliation must target canonical Fuxing large-freezer");
assert.match(migration, /site='fuxing'/, "reconciliation must remain scoped to Fuxing");
assert.doesNotMatch(migration, /site='(?:yongji|central)'/, "reconciliation must not write Yongji or central stock");
assert.match(migration, /kind='storage'/, "target must be an inventory storage location");
assert.match(migration, /FUXING_RECONCILE_VERIFY_FAILED/, "every row must be read back after write");
assert.match(migration, /v_applied <> 51/, "transaction must fail unless all 51 rows are processed");
assert.match(migration, /source_stocktake_date','2026-09-10'/, "audit must retain the source stocktake date");
assert.match(migration, /reconciled_at','2026-09-11'/, "audit must retain the reconciliation date");
assert.match(migration, /scope','fuxing-large-freezer-only'/, "audit must record the exact location scope");
assert.doesNotMatch(migration, /set\s+minimum_quantity\s*=/i, "reconciliation must not overwrite configured minimum quantities");

console.log("FUXING_LARGE_FREEZER_RECONCILE_20260911_OK");
