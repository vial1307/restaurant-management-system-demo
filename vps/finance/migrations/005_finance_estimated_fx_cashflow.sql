-- Owner-only finance DB, never run against kitchen_os.
-- Foreign-currency monthly cashflow inputs retain the native amount plus the
-- TWD approximate snapshot used at save time. Legacy TWD rows stay identical.
BEGIN;
ALTER TABLE finance.cashflow_items
 ADD COLUMN IF NOT EXISTS original_currency varchar(3) REFERENCES finance.currencies(code),
 ADD COLUMN IF NOT EXISTS original_amount numeric(24,6),
 ADD COLUMN IF NOT EXISTS fx_rate_to_twd numeric(24,12),
 ADD COLUMN IF NOT EXISTS fx_rate_observed_at timestamptz,
 ADD COLUMN IF NOT EXISTS fx_rate_provider text;
UPDATE finance.cashflow_items SET original_currency='TWD'
 WHERE original_currency IS NULL;
UPDATE finance.cashflow_items SET original_amount=amount_twd
 WHERE original_amount IS NULL;
UPDATE finance.cashflow_items SET fx_rate_to_twd=1
 WHERE fx_rate_to_twd IS NULL AND original_currency='TWD';
ALTER TABLE finance.cashflow_items
 DROP CONSTRAINT IF EXISTS cashflow_original_amount_valid;
ALTER TABLE finance.cashflow_items
 ADD CONSTRAINT cashflow_original_amount_valid CHECK(original_amount>0 AND fx_rate_to_twd>0);
INSERT INTO finance.schema_migrations(version) VALUES('005_finance_estimated_fx_cashflow')
 ON CONFLICT (version) DO NOTHING;
COMMIT;
