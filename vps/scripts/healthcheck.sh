#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
set -a
source "${APP_DIR}/.env"
set +a

cd "${APP_DIR}"

echo "=== PostgreSQL readiness ==="
docker compose --env-file .env exec -T db   pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "=== Core tables ==="
docker compose --env-file .env exec -T db   psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Atqc "
    select
      to_regclass('public.app_users') is not null,
      to_regclass('public.inventory_items') is not null,
      to_regclass('public.inventory_stock') is not null,
      to_regclass('public.schema_migrations') is not null;
  "
