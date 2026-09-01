#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
set -a
source "${APP_DIR}/.env"
set +a
cd "${APP_DIR}"

docker compose --env-file .env exec -T db   psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "
select
  (select count(*) from public.app_users) as users,
  (select count(*) from public.inventory_items where active=true) as active_items,
  (select count(*) from public.inventory_stock) as stock_rows,
  (select count(*) from public.inventory_transactions) as transactions,
  (select count(*) from public.inventory_receive_defaults) as receive_defaults,
  (select max(version) from public.schema_migrations) as schema_version;
"
