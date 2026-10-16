-- Finance-only v003: owner-scoped goal allocations, separate from debt reserves and posted ledger.
-- Plans/earmarks never move cash or change the manually tracked goal.current_amount.
BEGIN;
-- Existing goals.id PK does not certify the composite (id, owner) FK. Add
-- a non-destructive unique index before creating the owned allocation rows.
CREATE UNIQUE INDEX IF NOT EXISTS finance_goals_id_owner_uniq_idx
  ON finance.goals(id,owner_user_id);
CREATE TABLE IF NOT EXISTS finance.goal_fund_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  month_date date NOT NULL CHECK(EXTRACT(DAY FROM month_date)=1),
  planned_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(planned_amount >= 0),
  earmarked_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(earmarked_amount >= 0),
  fx_rate_to_twd numeric(24,12) NOT NULL CHECK(fx_rate_to_twd > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(goal_id,owner_user_id) REFERENCES finance.goals(id,owner_user_id),
  UNIQUE(owner_user_id,goal_id,month_date)
);
CREATE INDEX IF NOT EXISTS goal_fund_allocations_month_idx
  ON finance.goal_fund_allocations(owner_user_id,month_date);
INSERT INTO finance.schema_migrations(version) VALUES('003_finance_goal_funds')
  ON CONFLICT(version) DO NOTHING;
COMMIT;
