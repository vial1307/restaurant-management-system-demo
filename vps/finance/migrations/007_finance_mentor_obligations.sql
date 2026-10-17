-- Finance private schema only. Does not touch restaurant or posted ledger.
BEGIN;
CREATE TABLE IF NOT EXISTS finance.debt_mentor_terms (
  debt_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  creditor_type text NOT NULL DEFAULT 'other'
    CHECK (creditor_type IN ('bank_loan','credit_card','friend_family','installment_provider','other')),
  obligation_type text NOT NULL DEFAULT 'unconfirmed'
    CHECK (obligation_type IN ('fixed','agreed_flexible','unconfirmed')),
  minimum_due_amount numeric(24,6) CHECK (minimum_due_amount IS NULL OR minimum_due_amount >= 0),
  relationship_priority text NOT NULL DEFAULT 'normal'
    CHECK (relationship_priority IN ('high','normal','low')),
  negotiation_status text NOT NULL DEFAULT 'none'
    CHECK (negotiation_status IN ('none','requested','confirmed')),
  next_contact_date date,
  reminders_enabled boolean NOT NULL DEFAULT false,
  memo text NOT NULL DEFAULT '' CHECK (char_length(memo) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_user_id,debt_id),
  FOREIGN KEY(debt_id,owner_user_id) REFERENCES finance.debts(id,owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS finance_debt_terms_contact_idx
  ON finance.debt_mentor_terms(owner_user_id,next_contact_date);

CREATE TABLE IF NOT EXISTS finance.mentor_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,owner_user_id)
);
CREATE INDEX IF NOT EXISTS finance_mentor_conversations_owner_idx
  ON finance.mentor_conversations(owner_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS finance.mentor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 10000),
  as_of date,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,owner_user_id)
    REFERENCES finance.mentor_conversations(id,owner_user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS finance_mentor_messages_recent_idx
  ON finance.mentor_messages(owner_user_id,conversation_id,created_at DESC);

INSERT INTO finance.schema_migrations(version)
 VALUES('007_finance_mentor_obligations') ON CONFLICT(version) DO NOTHING;
COMMIT;
