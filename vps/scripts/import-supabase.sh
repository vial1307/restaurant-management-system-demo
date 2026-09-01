#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
REPO_DIR="${APP_DIR}/repo"
IMPORT_DIR="${APP_DIR}/imports/supabase-$(date -u +%Y%m%dT%H%M%SZ)"

[[ -f "${APP_DIR}/.env" ]] || { echo "Missing ${APP_DIR}/.env"; exit 1; }

set -a
source "${APP_DIR}/.env"
set +a

cd "${APP_DIR}"

existing="$(docker compose --env-file .env exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Atqc "select (select count(*) from public.app_users)+(select count(*) from public.inventory_items)")"
if [[ "${existing}" != "0" ]]; then
  echo "Import refused: VPS already contains application data (count=${existing})."
  echo "This guard prevents accidental duplicate/destructive re-import."
  exit 1
fi

mkdir -p "${IMPORT_DIR}"
chmod 700 "${IMPORT_DIR}"

echo
echo "Open Supabase Dashboard > Connect > Session pooler / Shared pooler."
echo "Use the connection parameters shown there. Do not send the database secret in chat."

DEFAULT_HOST="aws-1-ap-southeast-1.pooler.supabase.com"
DEFAULT_USER="postgres.zqbpeizgxcaxrtpsujlr"

read -r -p "Host [${DEFAULT_HOST}]: " SUPA_HOST
SUPA_HOST="${SUPA_HOST:-$DEFAULT_HOST}"
SUPA_HOST="$(printf '%s' "${SUPA_HOST}" | xargs)"

read -r -p "Port [5432]: " SUPA_PORT
SUPA_PORT="$(printf '%s' "${SUPA_PORT:-5432}" | xargs)"

read -r -p "Database [postgres]: " SUPA_DB
SUPA_DB="$(printf '%s' "${SUPA_DB:-postgres}" | xargs)"

read -r -p "User [${DEFAULT_USER}]: " SUPA_USER
SUPA_USER="${SUPA_USER:-$DEFAULT_USER}"
SUPA_USER="$(printf '%s' "${SUPA_USER}" | xargs)"

read -r -s -p "Database secret: " SUPA_SECRET
echo

[[ "${SUPA_HOST}" == *.pooler.supabase.com ]] || { echo "Invalid pooler host: '${SUPA_HOST}'"; exit 1; }
[[ "${SUPA_USER}" == postgres.* ]] || { echo "Invalid pooler user: '${SUPA_USER}'"; exit 1; }
[[ -n "${SUPA_SECRET}" ]] || { echo "No database secret supplied."; exit 1; }

remote_psql() {
  docker run --rm \
    --env "PGPASSWORD=${SUPA_SECRET}" \
    postgres:16-alpine \
    psql -h "${SUPA_HOST}" -p "${SUPA_PORT}" -U "${SUPA_USER}" -d "${SUPA_DB}" -v ON_ERROR_STOP=1 "$@"
}
echo "Checking Supabase connection and source counts..."
remote_psql -Atqc "
select json_build_object(
  'profiles',(select count(*) from public.profiles),
  'active_items',(select count(*) from public.inventory_items where active=true),
  'stock_rows',(select count(*) from public.inventory_stock),
  'transactions',(select count(*) from public.inventory_transactions),
  'receive_defaults',(select count(*) from public.inventory_receive_defaults)
)::text;
" | tee "${IMPORT_DIR}/source_counts.json"

echo
read -r -p "Type IMPORT to continue with data migration: " CONFIRM_IMPORT
[[ "${CONFIRM_IMPORT}" == "IMPORT" ]] || { echo "Import cancelled before any application data was written."; unset SUPA_SECRET; exit 0; }

echo "Creating pre-import VPS backup after connection validation..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

export_csv() {
  local name="$1"
  local query="$2"
  echo "Export ${name}..."
  remote_psql -c "copy (${query}) to stdout with (format csv, header true)" > "${IMPORT_DIR}/${name}.csv"
}

export_csv profiles "select id,username,display_name,role,location,active,permissions,preferred_language,created_at,updated_at from public.profiles order by created_at,id"
export_csv locations "select id,code,name_zh_tw,name_vi,site,kind,sort_order,active from public.inventory_locations order by site,sort_order,code"
export_csv items "select id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,created_at,updated_at from public.inventory_items order by item_key,id"
export_csv stock "select item_id,location_id,quantity,minimum_quantity,updated_at from public.inventory_stock order by item_id,location_id"
export_csv transactions "select id,item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,created_at from public.inventory_transactions order by created_at,id"
export_csv receive_defaults "select site,catalog_key,location_id,updated_by,updated_at from public.inventory_receive_defaults order by site,catalog_key"

unset SUPA_SECRET SUPA_HOST SUPA_PORT SUPA_DB SUPA_USER

local_psql() {
  docker compose --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

echo "Preparing staging tables..."
cat "${REPO_DIR}/vps/database/import/prepare_stage.sql" | local_psql

copy_csv() {
  local table="$1"
  local columns="$2"
  local file="$3"
  echo "Load ${table}..."
  cat "${file}" | local_psql -c "copy import_stage.${table}(${columns}) from stdin with (format csv, header true)"
}

copy_csv profiles "id,username,display_name,role,location,active,permissions,preferred_language,created_at,updated_at" "${IMPORT_DIR}/profiles.csv"
copy_csv locations "id,code,name_zh_tw,name_vi,site,kind,sort_order,active" "${IMPORT_DIR}/locations.csv"
copy_csv items "id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,created_at,updated_at" "${IMPORT_DIR}/items.csv"
copy_csv stock "item_id,location_id,quantity,minimum_quantity,updated_at" "${IMPORT_DIR}/stock.csv"
copy_csv transactions "id,item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,created_at" "${IMPORT_DIR}/transactions.csv"
copy_csv receive_defaults "site,catalog_key,location_id,updated_by,updated_at" "${IMPORT_DIR}/receive_defaults.csv"

echo "Applying normalized data to VPS schema..."
cat "${REPO_DIR}/vps/database/import/apply_stage.sql" | local_psql

echo "VPS counts after import:"
local_psql -c "
select
  (select count(*) from public.app_users) as users,
  (select count(*) from public.inventory_items where active=true) as active_items,
  (select count(*) from public.inventory_stock) as stock_rows,
  (select count(*) from public.inventory_transactions) as transactions,
  (select count(*) from public.inventory_receive_defaults) as receive_defaults;
"

echo "Creating post-import backup..."
bash "${REPO_DIR}/vps/scripts/backup.sh"

echo "Import files retained at: ${IMPORT_DIR}"
echo "Supabase remains untouched/readable; no cutover has occurred yet."
