# Kitchen OS VPS

This folder is the new VPS deployment path. It is isolated from the current Supabase/GitHub Pages runtime until cutover.

## Target architecture

- Ubuntu 22.04
- Docker + Docker Compose
- PostgreSQL 16 (private network only)
- Node.js API
- Caddy HTTPS
- GitHub Actions deployment
- PostgreSQL backups via pg_dump / pg_restore

## Deployment rule

Normal updates should become:

GitHub -> automated tests -> pre-deploy DB backup (only when migrations exist) -> migration -> deploy -> health check.

No manual SQL pasting during normal operation.

## Database rule

PostgreSQL is the single source of truth. Frontend must call /api and must not connect directly to PostgreSQL.

## Backup rule

- pre-deploy backup before DB migration
- periodic pg_dump custom-format backups
- checksum validation
- later: encrypted off-site copy
- restore test on a temporary database

## Initial server bootstrap

First secure SSH and install Docker. Then copy .env.example to /opt/kitchen-os/.env and set a strong random PostgreSQL password. Do not commit .env.

The first compose file starts PostgreSQL only. Backend/API will be connected after Supabase data export and schema conversion are verified.
