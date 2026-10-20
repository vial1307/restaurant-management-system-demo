-- Record actual borrowing receipts without classifying the proceeds as earned income.
-- Existing immutable events remain unchanged; provenance is identified by this mapping.
CREATE TABLE IF NOT EXISTS finance.debt_disbursements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL,
 debt_id uuid NOT NULL,
 event_id uuid NOT NULL,
 account_id uuid NOT NULL,
 currency_code varchar(3) NOT NULL,
 received_amount numeric(24,6) NOT NULL CHECK (received_amount > 0),
 fx_rate_to_twd numeric(24,12) NOT NULL CHECK (fx_rate_to_twd > 0),
 received_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_user_id,debt_id),
 UNIQUE(owner_user_id,event_id),
 FOREIGN KEY(debt_id,owner_user_id) REFERENCES finance.debts(id,owner_user_id) ON DELETE RESTRICT,
 FOREIGN KEY(event_id,owner_user_id) REFERENCES finance.events(id,owner_user_id),
 FOREIGN KEY(account_id,owner_user_id,currency_code) REFERENCES finance.accounts(id,owner_user_id,currency_code)
);
CREATE INDEX IF NOT EXISTS debt_disbursements_owner_date_idx ON finance.debt_disbursements(owner_user_id,received_date);
INSERT INTO finance.schema_migrations(version) VALUES('008_finance_loan_receipts') ON CONFLICT(version) DO NOTHING;
