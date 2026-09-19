#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kitchen-os}"
set -a
source "${APP_DIR}/.env"
set +a
cd "${APP_DIR}"

psql_base=(docker compose --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}")

scalar() {
  "${psql_base[@]}" -Atqc "$1" | tr -d '[:space:]'
}

stock_mismatch="$(scalar "
  select count(*)
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  join public.inventory_locations l on l.id=s.location_id
  where split_part(i.item_key,':',1)<>l.site
")"

default_mismatch="$(scalar "
  select count(*)
  from public.inventory_receive_defaults d
  join public.inventory_locations l on l.id=d.location_id
  where d.site<>l.site
")"

unknown_item_site="$(scalar "
  select count(*)
  from public.inventory_items i
  left join public.sites st on st.code=split_part(i.item_key,':',1)
  where st.code is null
")"

echo "Inventory site isolation pre-migration audit:"
echo "  stock_site_mismatch=${stock_mismatch}"
echo "  receive_default_site_mismatch=${default_mismatch}"
echo "  unknown_item_site=${unknown_item_site}"

if [[ "${stock_mismatch}" != "0" || "${default_mismatch}" != "0" || "${unknown_item_site}" != "0" ]]; then
  echo "INVENTORY_SITE_ISOLATION_AUDIT_FAILED"
  exit 1
fi

echo "INVENTORY_SITE_ISOLATION_AUDIT_OK"
