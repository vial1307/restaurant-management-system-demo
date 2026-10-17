-- Finance-only planned debt dates. Additive migration; no existing plans or ledger changed.
BEGIN;
ALTER TABLE finance.debt_fund_allocations ADD COLUMN IF NOT EXISTS payment_day smallint;
ALTER TABLE finance.debt_fund_allocations DROP CONSTRAINT IF EXISTS debt_fund_payment_day_valid;
ALTER TABLE finance.debt_fund_allocations ADD CONSTRAINT debt_fund_payment_day_valid CHECK (payment_day BETWEEN 1 AND 31);
INSERT INTO finance.schema_migrations(version) VALUES ('006_finance_debt_payment_priority') ON CONFLICT DO NOTHING;
COMMIT;
