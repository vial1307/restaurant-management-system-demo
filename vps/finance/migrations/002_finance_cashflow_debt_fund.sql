-- Private Finance v002: planned cash flow, monthly debt reserves and posted repayment FX valuation.
-- Isolated finance database ONLY. All money-moving facts remain in the immutable ledger.
BEGIN;
CREATE TABLE IF NOT EXISTS finance.cashflow_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  month_date date NOT NULL CHECK (EXTRACT(DAY FROM month_date)=1),
  kind text NOT NULL CHECK(kind IN ('income','expense')),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 140),
  amount_twd numeric(24,6) NOT NULL CHECK(amount_twd > 0),
  due_day smallint CHECK(due_day BETWEEN 1 AND 31),
  memo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS cashflow_items_owner_month_idx ON finance.cashflow_items(owner_user_id,month_date,kind);
CREATE TABLE IF NOT EXISTS finance.debt_fund_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  debt_id uuid NOT NULL,
  month_date date NOT NULL CHECK (EXTRACT(DAY FROM month_date)=1),
  planned_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(planned_amount >= 0),
  earmarked_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(earmarked_amount >= 0),
  -- Manual rate, TWD per one unit of the debt currency. 1 for TWD debts.
  fx_rate_to_twd numeric(24,12) NOT NULL CHECK (fx_rate_to_twd > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(debt_id,owner_user_id) REFERENCES finance.debts(id,owner_user_id),
  UNIQUE(owner_user_id,debt_id,month_date)
);
CREATE INDEX IF NOT EXISTS debt_fund_allocations_month_idx ON finance.debt_fund_allocations(owner_user_id,month_date);
ALTER TABLE finance.debt_payments
 ADD COLUMN IF NOT EXISTS base_amount_twd numeric(24,6) CHECK (base_amount_twd >= 0),
 ADD COLUMN IF NOT EXISTS fx_rate_to_twd numeric(24,12) CHECK (fx_rate_to_twd > 0);
-- Paid debt repayments are settled postings: never allow in-place modification.
DROP TRIGGER IF EXISTS debt_payments_immutable ON finance.debt_payments;
CREATE TRIGGER debt_payments_immutable BEFORE UPDATE OR DELETE ON finance.debt_payments
 FOR EACH ROW EXECUTE FUNCTION finance.prevent_posted_mutation();
CREATE INDEX IF NOT EXISTS debt_payment_owner_month_idx ON finance.debt_payments(owner_user_id,payment_date);
INSERT INTO finance.schema_migrations(version) VALUES('002_finance_cashflow_debt_fund')
 ON CONFLICT(version) DO NOTHING;
COMMIT;
