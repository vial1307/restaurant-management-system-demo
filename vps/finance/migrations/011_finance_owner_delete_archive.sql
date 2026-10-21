-- Allow the single owner to remove Finance items from daily management
-- without making immutable posted payment/receipt rows disappear.
-- Historical journal / payment data is kept for accurate wallets and reports.
ALTER TABLE finance.debts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE finance.categories ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS finance_debts_current_owner_idx
 ON finance.debts(owner_user_id,id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS finance_categories_current_owner_idx
 ON finance.categories(owner_user_id,kind) WHERE archived_at IS NULL;
-- Allow a previously removed category name to be reused for a fresh category.
ALTER TABLE finance.categories DROP CONSTRAINT IF EXISTS categories_owner_user_id_kind_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_unique_visible_name
 ON finance.categories(owner_user_id,kind,name) WHERE archived_at IS NULL;
INSERT INTO finance.schema_migrations(version) VALUES ('011_finance_owner_delete_archive')
 ON CONFLICT (version) DO NOTHING;
