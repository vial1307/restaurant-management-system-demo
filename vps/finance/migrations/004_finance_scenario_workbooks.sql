-- Finance OS v004: hypothetical scenario workbooks. Finance database ONLY.
-- These entries MUST NEVER create ledger events, debt payments, or withdrawals.
BEGIN;
CREATE TABLE IF NOT EXISTS finance.scenario_workbooks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 90),
 settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS scenario_workbooks_owner_time_idx
 ON finance.scenario_workbooks(owner_user_id,updated_at DESC);
INSERT INTO finance.schema_migrations(version) VALUES('004_finance_scenario_workbooks')
 ON CONFLICT(version) DO NOTHING;
COMMIT;
