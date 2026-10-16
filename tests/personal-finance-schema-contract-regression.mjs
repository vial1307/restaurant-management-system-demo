import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const ddl=read("vps/finance/migrations/001_personal_finance.sql");
const overlay=read("vps/docker-compose.finance.yml");
const deploy=read("vps/finance/migrate.sh");
const spec=read("docs/spec-deltas/2026-10-16-personal-finance-os.md");
for (const table of ["schema_migrations","currencies","accounts","categories","events","entries","fx_exchanges","fx_rates","fx_plans","monthly_budgets","goals","debts","debt_payments","audit_events"]) {
 assert.ok(ddl.includes("CREATE TABLE IF NOT EXISTS finance."+table+" ("),"missing "+table);
}
assert.ok(ddl.includes("UNIQUE(owner_user_id, idempotency_key)"));
assert.ok(ddl.includes("FOREIGN KEY(account_id,owner_user_id,currency_code)"));
assert.ok(ddl.includes("entries_immutable") && ddl.includes("events_immutable"));
assert.doesNotMatch(ddl,/\b(?:drop table|truncate)\b/i);
assert.doesNotMatch(ddl,/public\.inventory|public\.app_users|public\.business_state/i);
assert.match(overlay,/finance_db:/);
assert.match(overlay,/finance_postgres_data:/);
assert.match(overlay,/FINANCE_OWNER_USER_ID/);
assert.match(overlay,/FINANCE_POSTGRES_PASSWORD/);
assert.doesNotMatch(overlay,/postgres_data:\/var\/lib\/postgresql\/data/);
assert.match(deploy,/pg_dump/);
assert.match(deploy,/ON_ERROR_STOP=1/);
assert.match(spec,/separate PostgreSQL database/);
console.log("PASS personal finance isolated DB static contract");
