-- Owner-only Finance DB v006: optional notes on planned liabilities and goals.
-- Safe additive migration; does not touch immutable posted ledger.
BEGIN;
ALTER TABLE finance.debts ADD COLUMN IF NOT EXISTS memo text NOT NULL DEFAULT '';
ALTER TABLE finance.goals ADD COLUMN IF NOT EXISTS memo text NOT NULL DEFAULT '';
INSERT INTO finance.schema_migrations(version) VALUES('006_finance_debt_goal_notes') ON CONFLICT (version) DO NOTHING;
COMMIT;
