# Finance OS — private VPS database + standalone website

**Website hostname:** https://finance.82.47.180.185.nip.io/

This is a separate HTTPS origin, static UI and PostgreSQL 16 database on the **existing VPS**. It shares the existing Kitchen OS identity store for login (each origin has a separate host-only session cookie), but is not a restaurant module and does not share its business/inventory tables, UI, finance records or PostgreSQL volume.

## Runtime
- Finance static page: `finance.html`, `src/personal-finance.css`, `src/personal-finance.js`.
- Caddy restricts the Finance hostname to `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/finance/*` and the above UI assets; all other paths return 404.
- Only the explicitly configured `FINANCE_OWNER_USER_ID` can log in to the Finance hostname and use the Finance API. Normal restaurant roles, other Super Admins, and anonymous sessions never acquire finance privileges.
- The initial deployment script resolves the **active primary Kitchen OS administrator username `yangchuadmin`** to exactly one UUID. If it does not resolve, provisioning refuses. If this login is shared, the operator must switch to a private dedicated account before placing sensitive finances on the server.
- `vps/docker-compose.finance.yml` creates `kitchen-finance-db`, its own Postgres credentials, and persistent volume; production `kitchen-os-db` is not modified.
- `vps/finance/provision.sh` automatically runs after Kitchen OS's tested production release and verifies minimum 1 GiB free disk and 300 MiB available RAM.
- `vps/finance/migrate.sh` encrypts its pre-migration DB dump before schema changes.
- `vps/finance/backup-encrypted.sh` makes an AES-256-CBC encrypted pg_dump, SHA-256 checksum, restores into an independent temporary Finance DB, checks schema, and retains 14 days of encrypted backups. Installed into daily root cron at 04:11 VPS-local time.
- Secrets live only in root-protected `/opt/kitchen-os/.env`, generated with `openssl rand` **on VPS** and never printed to public GitHub logs.

## Deployment and verification
1. All exact-head PR CI gates pass: PostgreSQL 16 isolated DB + owner auth, finance UI 320/390/1440px, Kitchen staging, Caddy syntax, full restaurant regression.
2. Merge reviewed PR; existing gated Kitchen production workflow deploys the exact tested commit to the VPS. Only after Kitchen postdeploy health succeeds, `vps/finance/provision.sh` starts private Finance DB, runs migrations, activates Finance env on app, verifies DB and restore-tested encrypted backup.
3. Confirm HTTPS `/finance.html` responds with 200; unauthenticated `/api/finance/access` responds 401; Finance-host `/api/inventory/central` responds 404; log in as the designated owner then exercise read/write/readback and confirm transactions persist after reload.
4. Review Finance database backup/restore and protected owner credentials before using real financial records.

## Loan receipt — finance source of truth

- `+ Nhận tiền vay` is an **actual financing receipt**, not salary, ordinary income or a future plan. It creates a debt master, immutable journal credit to the selected same-currency wallet, debt disbursement mapping, owner-scoped audit event, and Mentor creditor metadata in one PostgreSQL transaction.
- `+ Khoản nợ chưa giải ngân` and monthly `cashflow` debt-plan routes retain the previous contract: **no money is minted** merely by entering a debt or planned allocation. Historic debts are never automatically backfilled as cash.
- On an actual loan receipt, original principal equals actual gross cash received. Cases with fees deducted at source or partial drawdowns require separate validation/workflow; do not falsify cash balance by entering a larger principal than the deposit.
- The posted financing inflow is deliberately recorded under the existing immutable journal event kind `adjustment` and classified as `borrowing` **only through its unique `finance.debt_disbursements` mapping**. We do not alter the legacy CHECK enum or unconditionally reinterpret unrelated balance adjustments.
- Actual monthly finance report: borrowing receipts are shown separately from earned income, and repayments include principal + recorded interest + fees. Outstanding debt decreases only by **principalPaid**, while the wallet decreases by the full paid amount.
- Annual income/expense totals, budgets and savings priorities remain unchanged. Actual financing receipts already appear in wallet balances; advisor and simulator do not add historic receipts to a future forecast again. AI Mentor reads the shared debt and creditor classification but does not infer contractual minimum payments.
- Idempotency keys, dedicated owner auth, immutable event/entry ledger, PostgreSQL transaction boundaries and audit history are preserved. Disbursed debts cannot be deleted even before repayment.
- This is a **deterministic personal planning implementation** designed for this application; it is not an IFRS-compliant financial statement or a guarantee of debt affordability. Accounting distinction: [IAS 7 Financing activities](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html) (borrowing receipts/repayments separate from operations); personal cashflow schedule concepts: [CFPB Your Money, Your Goals](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/). The local priority `debt > essential expense > savings` is user-defined, **not mandated by those standards**.

## Safety
- Do **not** use `docker compose down -v` or delete `finance_postgres_data` (permanent loss of finance database).
- Separate hostname means login requires a **new session on Finance**; being logged in on restaurant hostname does not grant automatic access.
- No real bank transfers are initiated. Multi-currency plans are plans; posted conversions must be entered only after actual owned-wallet currency exchanges. FX rates are manually recorded snapshots, not live provider quotes.
- If Finance activation fails, check output `FINANCE_*` and leave the restaurant DB intact. Do not modify `public.inventory_*` to fix finance.
- **Disaster recovery:** encrypted backups need `FINANCE_BACKUP_KEY` in addition to the backup file. Store that secret securely outside the VPS before relying on the backups; the automated local backup cannot protect against complete VPS loss.

## Current release status
See `docs/CURRENT_HANDOFF.md`. Source code and staged migrations are not evidence of live production until the exact GitHub deployment workflow verifies the new hostname and private database.
