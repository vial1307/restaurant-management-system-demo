-- Personal Finance OS v001. Execute ONLY against the dedicated finance database.
-- This migration never runs against kitchen_os; dedicated PostgreSQL volume is required.
BEGIN;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE TABLE IF NOT EXISTS finance.schema_migrations (
  version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance.currencies (
  code varchar(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name_vi text NOT NULL,
  symbol text NOT NULL,
  minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 6),
  enabled boolean NOT NULL DEFAULT true
);
INSERT INTO finance.currencies(code,name_vi,symbol,minor_units) VALUES
 ('TWD','Đô la Đài Loan','NT$',0),
 ('VND','Đồng Việt Nam','₫',0),
 ('USD','Đô la Mỹ','$',2),
 ('JPY','Yên Nhật','¥',0),
 ('EUR','Euro','€',2),
 ('CNY','Nhân dân tệ','¥',2)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS finance.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('cash','bank','ewallet','other')),
 currency_code varchar(3) NOT NULL REFERENCES finance.currencies(code),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id, owner_user_id),
 UNIQUE(id, owner_user_id, currency_code)
);
CREATE INDEX IF NOT EXISTS finance_accounts_owner_idx ON finance.accounts(owner_user_id,active);

CREATE TABLE IF NOT EXISTS finance.categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN ('income','expense')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_user_id),
 UNIQUE(owner_user_id,kind,name)
);

CREATE TABLE IF NOT EXISTS finance.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('income','expense','transfer','fx','remittance','adjustment','reversal')),
 occurred_at timestamptz NOT NULL,
 description text NOT NULL DEFAULT '',
 idempotency_key uuid NOT NULL,
 reverses_event_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id, owner_user_id),
 UNIQUE(owner_user_id, idempotency_key),
 FOREIGN KEY(reverses_event_id, owner_user_id) REFERENCES finance.events(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS finance_events_owner_time_idx ON finance.events(owner_user_id,occurred_at DESC,id);

CREATE TABLE IF NOT EXISTS finance.entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL,
 owner_user_id uuid NOT NULL,
 account_id uuid NOT NULL,
 currency_code varchar(3) NOT NULL,
 amount numeric(24,6) NOT NULL CHECK(amount <> 0),
 category_id uuid,
 -- Signed original value converted to TWD at time of actual posting, for reporting.
 base_amount_twd numeric(24,6),
 fx_rate_to_twd numeric(24,12) CHECK (fx_rate_to_twd > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(event_id,owner_user_id) REFERENCES finance.events(id,owner_user_id),
 FOREIGN KEY(account_id,owner_user_id,currency_code) REFERENCES finance.accounts(id,owner_user_id,currency_code),
 FOREIGN KEY(category_id,owner_user_id) REFERENCES finance.categories(id,owner_user_id),
 CHECK ((base_amount_twd IS NULL AND fx_rate_to_twd IS NULL) OR
        (base_amount_twd IS NOT NULL AND fx_rate_to_twd IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS finance_entries_account_idx ON finance.entries(owner_user_id,account_id,event_id);
CREATE INDEX IF NOT EXISTS finance_entries_event_idx ON finance.entries(event_id);
CREATE INDEX IF NOT EXISTS finance_entries_category_idx ON finance.entries(owner_user_id,category_id) WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance.fx_exchanges (
 event_id uuid PRIMARY KEY REFERENCES finance.events(id),
 owner_user_id uuid NOT NULL,
 from_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 to_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 source_amount numeric(24,6) NOT NULL CHECK(source_amount > 0),
 received_amount numeric(24,6) NOT NULL CHECK(received_amount > 0),
 effective_rate numeric(24,12) NOT NULL CHECK(effective_rate > 0),
 fee_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(fee_amount >= 0),
 fee_currency varchar(3) REFERENCES finance.currencies(code),
 rate_source text NOT NULL DEFAULT 'manual',
 booked_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_currency <> to_currency),
 CHECK((fee_amount = 0) OR (fee_currency IS NOT NULL)),
 FOREIGN KEY(event_id,owner_user_id) REFERENCES finance.events(id,owner_user_id)
);

CREATE TABLE IF NOT EXISTS finance.fx_rates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 base_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 quote_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 rate numeric(24,12) NOT NULL CHECK(rate > 0),
 provider text NOT NULL CHECK(char_length(btrim(provider)) > 0),
 observed_at timestamptz NOT NULL,
 inserted_at timestamptz NOT NULL DEFAULT now(),
 CHECK(base_currency <> quote_currency),
 UNIQUE(base_currency,quote_currency,provider,observed_at)
);
CREATE INDEX IF NOT EXISTS finance_rates_pair_time_idx
 ON finance.fx_rates(base_currency,quote_currency,observed_at DESC);

CREATE TABLE IF NOT EXISTS finance.fx_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 plan_date date NOT NULL,
 plan_kind text NOT NULL CHECK(plan_kind IN ('fx','remittance')),
 from_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 to_currency varchar(3) NOT NULL REFERENCES finance.currencies(code),
 source_amount numeric(24,6) NOT NULL CHECK(source_amount > 0),
 expected_rate numeric(24,12) CHECK(expected_rate > 0),
 expected_fee numeric(24,6) NOT NULL DEFAULT 0 CHECK(expected_fee >= 0),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','cancelled','completed')),
 confirmed_event_id uuid,
 memo text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_currency <> to_currency),
 FOREIGN KEY(confirmed_event_id,owner_user_id) REFERENCES finance.events(id,owner_user_id),
 CHECK ((status='completed' AND confirmed_event_id IS NOT NULL) OR
       (status<>'completed' AND confirmed_event_id IS NULL))
);
CREATE INDEX IF NOT EXISTS finance_fx_plans_owner_date_idx ON finance.fx_plans(owner_user_id,plan_date);

CREATE TABLE IF NOT EXISTS finance.monthly_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 category_id uuid NOT NULL,
 month_date date NOT NULL,
 amount_twd numeric(24,6) NOT NULL CHECK(amount_twd >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(category_id,owner_user_id) REFERENCES finance.categories(id,owner_user_id),
 UNIQUE(owner_user_id, category_id,month_date),
 CHECK (EXTRACT(DAY FROM month_date)=1)
);
CREATE INDEX IF NOT EXISTS finance_monthly_budgets_owner_month_idx
 ON finance.monthly_budgets(owner_user_id,month_date);

CREATE TABLE IF NOT EXISTS finance.goals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 currency_code varchar(3) NOT NULL REFERENCES finance.currencies(code),
 target_amount numeric(24,6) NOT NULL CHECK(target_amount > 0),
 current_amount numeric(24,6) NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
 target_date date,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','achieved','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_goals_owner_idx ON finance.goals(owner_user_id,status);

CREATE TABLE IF NOT EXISTS finance.debts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 currency_code varchar(3) NOT NULL REFERENCES finance.currencies(code),
 principal_original numeric(24,6) NOT NULL CHECK(principal_original >= 0),
 annual_interest_rate numeric(12,8) NOT NULL DEFAULT 0 CHECK(annual_interest_rate >= 0),
 due_date date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_user_id)
);
CREATE TABLE IF NOT EXISTS finance.debt_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 debt_id uuid NOT NULL,
 payment_date date NOT NULL,
 principal_paid numeric(24,6) NOT NULL DEFAULT 0 CHECK(principal_paid >= 0),
 interest_paid numeric(24,6) NOT NULL DEFAULT 0 CHECK(interest_paid >= 0),
 fee_paid numeric(24,6) NOT NULL DEFAULT 0 CHECK(fee_paid >= 0),
 event_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(principal_paid+interest_paid+fee_paid > 0),
 FOREIGN KEY(debt_id,owner_user_id) REFERENCES finance.debts(id,owner_user_id),
 FOREIGN KEY(event_id,owner_user_id) REFERENCES finance.events(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS finance_debt_payments_owner_idx ON finance.debt_payments(owner_user_id,debt_id,payment_date);

CREATE TABLE IF NOT EXISTS finance.audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_user_id uuid NOT NULL,
 actor_user_id uuid NOT NULL,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(metadata)='object')
);
CREATE INDEX IF NOT EXISTS finance_audit_owner_idx ON finance.audit_events(owner_user_id,created_at DESC);

-- Never erase/overwrite settled financial movements. Corrections use explicit reversals.
CREATE OR REPLACE FUNCTION finance.prevent_posted_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'POSTED_FINANCE_EVENTS_ARE_IMMUTABLE';
END $$;
DROP TRIGGER IF EXISTS entries_immutable ON finance.entries;
CREATE TRIGGER entries_immutable BEFORE UPDATE OR DELETE ON finance.entries
 FOR EACH ROW EXECUTE FUNCTION finance.prevent_posted_mutation();
DROP TRIGGER IF EXISTS events_immutable ON finance.events;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON finance.events
 FOR EACH ROW EXECUTE FUNCTION finance.prevent_posted_mutation();

INSERT INTO finance.schema_migrations(version) VALUES('001_personal_finance')
ON CONFLICT(version) DO NOTHING;
COMMIT;