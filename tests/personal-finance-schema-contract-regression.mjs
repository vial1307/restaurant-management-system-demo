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
assert.doesNotMatch(overlay,/^\s*-\s*postgres_data:\/var\/lib\/postgresql\/data\s*$/m);
const planDdl=read("vps/finance/migrations/002_finance_cashflow_debt_fund.sql");
for(const table of ["cashflow_items","debt_fund_allocations"]){
 assert.ok(planDdl.includes("CREATE TABLE IF NOT EXISTS finance."+table+" ("),"missing finance planning table "+table);
}
assert.match(planDdl,/debt_payments_immutable/);
assert.match(deploy,/\[0-9\]\[0-9\]\[0-9\]_\*\.sql/);
assert.doesNotMatch(planDdl,/public\.inventory|public\.app_users|public\.business_state|\bTRUNCATE\b/i);
assert.match(deploy,/pg_dump/);
assert.match(deploy,/ON_ERROR_STOP=1/);
assert.match(spec,/separate PostgreSQL database/);

const caddy=read("vps/Caddyfile");
const website=read("finance.html");
const financeOrigin=caddy.split("finance.82.47.180.185.nip.io {")[1];
assert.ok(financeOrigin,"missing dedicated HTTPS finance virtual host");
assert.match(financeOrigin,/handle \/api\/finance\/\*/);
assert.match(financeOrigin,/handle \/ \{\s*root \* \/srv\s*rewrite \* \/finance\.html\s*file_server\s*\}/,"finance root must rewrite to real HTML");
assert.match(financeOrigin,/@loginApi path \/api\/auth\/login \/api\/auth\/logout \/api\/auth\/me/);
assert.match(financeOrigin,/handle @loginApi/);
assert.doesNotMatch(financeOrigin,/handle \/api\/inventory/);
assert.doesNotMatch(financeOrigin,/handle \/api\/admin/);
assert.match(financeOrigin,/respond "Not Found" 404/);
assert.match(financeOrigin,/Content-Security-Policy/);
assert.match(website,/id="finance-login-form"/);
const provision=read("vps/finance/provision.sh");
const backup=read("vps/finance/backup-encrypted.sh");
const deployScript=read("vps/scripts/deploy-api.sh");
assert.match(provision,/FINANCE_OWNER_USER_ID/);
assert.match(provision,/FINANCE_RESOURCE_PREFLIGHT_FAILED/);
assert.match(provision,/docker compose.*finance_db/);
assert.match(provision,/backup-encrypted\.sh/);
assert.match(backup,/openssl enc -aes-256-cbc/);
assert.match(backup,/finance_restore_rehearsal/);
assert.match(deployScript,/vps\/finance\/provision\.sh/);
assert.ok(deployScript.indexOf('echo "[11/12] Verifying production database integrity..."')<
  deployScript.indexOf('bash "$REPO_DIR/vps/finance/provision.sh"'),
  "finance provisioning must occur only after restaurant production health and DB integrity checks");

console.log("PASS personal finance isolated DB, HTTPS origin, provisioning and backup contracts");
