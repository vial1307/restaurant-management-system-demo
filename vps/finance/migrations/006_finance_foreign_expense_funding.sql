-- Finance DB ONLY: distinguish economic cost in VND from the TWD actually
-- required to purchase VND when the owner has not exchanged salary yet.
BEGIN;
ALTER TABLE finance.cashflow_items
 ADD COLUMN IF NOT EXISTS funding_mode text,
 ADD COLUMN IF NOT EXISTS funding_account_id uuid,
 ADD COLUMN IF NOT EXISTS conversion_day smallint,
 ADD COLUMN IF NOT EXISTS fx_fee_twd numeric(24,6) NOT NULL DEFAULT 0;
UPDATE finance.cashflow_items SET funding_mode=
 CASE WHEN COALESCE(original_currency,'TWD')='TWD' THEN 'twd_wallet'
      WHEN kind='expense' THEN 'twd_pending_fx'
      ELSE 'foreign_wallet' END
 WHERE funding_mode IS NULL;
ALTER TABLE finance.cashflow_items ALTER COLUMN funding_mode SET NOT NULL;
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS finance_cashflow_funding_mode_check;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT finance_cashflow_funding_mode_check
 CHECK (funding_mode IN ('twd_wallet','twd_pending_fx','foreign_wallet')
 AND (original_currency='TWD' OR funding_mode <> 'twd_wallet')
 AND (original_currency<>'TWD' OR funding_mode='twd_wallet')
 AND (funding_mode='twd_pending_fx' OR (fx_fee_twd=0 AND conversion_day IS NULL)));
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS finance_cashflow_fx_fee_check;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT finance_cashflow_fx_fee_check CHECK(fx_fee_twd>=0);
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS finance_cashflow_conversion_day_check;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT finance_cashflow_conversion_day_check CHECK(
 conversion_day BETWEEN 1 AND 31 OR conversion_day IS NULL);
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint WHERE conname='finance_cashflow_funding_account_fk'
 ) THEN
  ALTER TABLE finance.cashflow_items ADD CONSTRAINT finance_cashflow_funding_account_fk
   FOREIGN KEY(funding_account_id,owner_user_id) REFERENCES finance.accounts(id,owner_user_id);
 END IF;
END $$;
INSERT INTO finance.schema_migrations(version) VALUES('006_finance_foreign_expense_funding')
 ON CONFLICT (version) DO NOTHING;
COMMIT;
