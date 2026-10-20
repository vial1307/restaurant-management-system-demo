-- Optional target date for an owner-entered monthly debt repayment allocation.
-- It is NOT a legal/counterparty due date and does not alter debt master terms.
ALTER TABLE finance.debt_fund_allocations
 ADD COLUMN IF NOT EXISTS planned_payment_date date;
ALTER TABLE finance.debt_fund_allocations
 DROP CONSTRAINT IF EXISTS finance_debt_fund_target_same_month;
ALTER TABLE finance.debt_fund_allocations
 ADD CONSTRAINT finance_debt_fund_target_same_month CHECK
 (planned_payment_date IS NULL OR date_trunc('month',planned_payment_date)::date = month_date);
INSERT INTO finance.schema_migrations(version) VALUES('010_finance_debt_progress_dates')
 ON CONFLICT(version) DO NOTHING;
