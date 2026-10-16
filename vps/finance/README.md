# Personal Finance OS on the existing VPS

This package creates an **opt-in, separate** PostgreSQL 16 database for personal finance. It **does not** change the production restaurant database or enable finance API routes.

## Files
- `../docker-compose.finance.yml` — optional Compose overlay for new Postgres container and volume.
- `migrations/001_personal_finance.sql` — isolated schema for ledger, six initial currencies, budgets, planned exchange/remittances, goals/debts and audit.
- `migrate.sh` — private custom-format backup, SHA-256 checksum and migration with error checking.
- `../../docs/spec-deltas/2026-10-16-personal-finance-os.md` — financial semantics, isolation and acceptance criteria.

## Deployment preparation (not performed automatically)
1. Make a confidential backup of the existing VPS configuration and check free disk/RAM. Finance creates an additional Postgres container and a persistent volume.
2. Copy the overlay into the VPS runtime as `/opt/kitchen-os/docker-compose.finance.yml`. The checked-out repo must be at `/opt/kitchen-os/repo`.
3. Append `FINANCE_POSTGRES_PASSWORD` (a new long random secret) and `FINANCE_OWNER_USER_ID` (authorized `app_users.id` UUID) to `/opt/kitchen-os/.env`; protect this file (`chmod 600`). **Never commit or paste the values into a chat.**
4. Review and run from the VPS with `KITCHEN_RUNTIME_DIR=/opt/kitchen-os bash /opt/kitchen-os/repo/vps/finance/migrate.sh`.
5. Verify `finance.schema_migrations`, six initial currencies, immutable-posting constraints, backup checksum and a **restore rehearsal**.
6. Only after implementing & testing owner-scoped /api/finance endpoints and UI: enable the overlay for the app during production rollout. Make the deployment script preserve the overlay for subsequent releases, or it may become disabled again.

## Safety and status
- Running the migration does **not** move funds or connect to banking services.
- The FX catalog is not a live exchange-rate feed. Never show values as live unless collected from a verified source with timestamps.
- Existing Kitchen OS auth must **not** automatically expose personal-finance data to all admins; access must be explicitly owner-scoped.
- `finance_db` is independent of the Kitchen OS database and its backup; it needs its own backup schedule, retention, encryption and tested restore.
- **Stage 1 only.** No claim of deployed server persistence or an operational finance UI is made by this PR.
