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

## Safety
- Do **not** use `docker compose down -v` or delete `finance_postgres_data` (permanent loss of finance database).
- Separate hostname means login requires a **new session on Finance**; being logged in on restaurant hostname does not grant automatic access.
- No real bank transfers are initiated. Multi-currency plans are plans; posted conversions must be entered only after actual owned-wallet currency exchanges. FX rates are manually recorded snapshots, not live provider quotes.
- If Finance activation fails, check output `FINANCE_*` and leave the restaurant DB intact. Do not modify `public.inventory_*` to fix finance.
- **Disaster recovery:** encrypted backups need `FINANCE_BACKUP_KEY` in addition to the backup file. Store that secret securely outside the VPS before relying on the backups; the automated local backup cannot protect against complete VPS loss.

## Current release status
See `docs/CURRENT_HANDOFF.md`. Source code and staged migrations are not evidence of live production until the exact GitHub deployment workflow verifies the new hostname and private database.
