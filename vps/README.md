# Kitchen OS VPS

This folder is the production VPS deployment path. Supabase is no longer part of the runtime.

Deployment note: the UI refresh requested on 2026-09-03 starts from a server-side database dump and retained previous web release.

## Target architecture

- Ubuntu 22.04
- Docker + Docker Compose
- PostgreSQL 16 (private network only)
- Node.js API
- Caddy web edge
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

The browser talks only to `/api`; PostgreSQL remains private inside the Docker network.
