-- Explicit financing inflows in the editable cash-flow plan. Planning never posts a wallet entry.
-- One expected principal receipt per loan. Posted disbursements supersede this forecast.
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS cashflow_items_kind_check;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT cashflow_items_kind_check
 CHECK (kind IN ('income','expense','borrowing'));
ALTER TABLE finance.cashflow_items ADD COLUMN IF NOT EXISTS debt_id uuid;
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS cashflow_borrowing_link_valid;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT cashflow_borrowing_link_valid CHECK (
 (kind='borrowing' AND debt_id IS NOT NULL) OR
 (kind<>'borrowing' AND debt_id IS NULL)
);
ALTER TABLE finance.cashflow_items DROP CONSTRAINT IF EXISTS cashflow_borrowing_debt_owner_fk;
ALTER TABLE finance.cashflow_items ADD CONSTRAINT cashflow_borrowing_debt_owner_fk
 FOREIGN KEY(debt_id,owner_user_id) REFERENCES finance.debts(id,owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_borrowing_one_receipt_per_debt
 ON finance.cashflow_items(owner_user_id,debt_id) WHERE kind='borrowing';
CREATE INDEX IF NOT EXISTS finance_borrowing_plan_owner_month
 ON finance.cashflow_items(owner_user_id,month_date) WHERE kind='borrowing';
INSERT INTO finance.schema_migrations(version) VALUES('009_finance_planned_borrowing')
 ON CONFLICT(version) DO NOTHING;
