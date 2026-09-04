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

echo "=== Kitchen OS production data audit ==="
"${psql_base[@]}" -c "
select
  (select count(*) from public.app_users) as users,
  (select count(*) from public.app_users where active=true) as active_users,
  (select count(*) from public.inventory_items where active=true) as active_items,
  (select count(*) from public.inventory_stock) as stock_rows,
  (select count(*) from public.inventory_transactions) as transactions,
  (select count(*) from public.inventory_receive_defaults) as receive_defaults,
  (select count(*) from public.business_state) as business_state_sites,
  (select max(version) from public.schema_migrations) as schema_version;
"

"${psql_base[@]}" -c "
select l.site,
       count(distinct i.id) filter (where i.active=true) as active_items,
       count(s.*) as stock_rows,
       count(distinct l.id) filter (where l.active=true) as active_locations
from public.inventory_locations l
left join public.inventory_stock s on s.location_id=l.id
left join public.inventory_items i on i.id=s.item_id
group by l.site
order by l.site;
"

"${psql_base[@]}" -c "
select role, location, active, count(*) as users
from public.app_users
group by role, location, active
order by role, location, active desc;
"

errors=0
warnings=0

check_zero() {
  local label="$1"
  local query="$2"
  local value
  value="$(scalar "${query}")"
  if [[ "${value}" != "0" ]]; then
    echo "ERROR: ${label}: ${value}"
    errors=$((errors+1))
  else
    echo "OK: ${label}"
  fi
}

check_positive() {
  local label="$1"
  local query="$2"
  local value
  value="$(scalar "${query}")"
  if [[ -z "${value}" || "${value}" == "0" ]]; then
    echo "ERROR: ${label}: ${value:-0}"
    errors=$((errors+1))
  else
    echo "OK: ${label}: ${value}"
  fi
}

warn_nonzero() {
  local label="$1"
  local query="$2"
  local value
  value="$(scalar "${query}")"
  if [[ "${value}" != "0" ]]; then
    echo "WARNING: ${label}: ${value}"
    warnings=$((warnings+1))
  else
    echo "OK: ${label}"
  fi
}

check_positive "active inventory items exist" "select count(*) from public.inventory_items where active=true"
check_positive "inventory stock rows exist" "select count(*) from public.inventory_stock"
check_positive "Fuxing locations exist" "select count(*) from public.inventory_locations where site='fuxing' and active=true"
check_positive "Yongji locations exist" "select count(*) from public.inventory_locations where site='yongji' and active=true"
check_positive "Central locations exist" "select count(*) from public.inventory_locations where site='central' and active=true"

check_zero "negative inventory quantities" "select count(*) from public.inventory_stock where quantity<0"
check_zero "negative minimum quantities" "select count(*) from public.inventory_stock where minimum_quantity<0"
check_zero "receive defaults pointing to wrong site/non-storage" "
  select count(*)
  from public.inventory_receive_defaults d
  join public.inventory_locations l on l.id=d.location_id
  where l.site<>d.site or l.kind<>'storage' or l.active=false
"
check_zero "active catalog rows missing required fields" "
  select count(*)
  from public.inventory_items
  where active=true
    and (trim(item_key)='' or trim(catalog_key)='' or trim(name_zh_tw)='' or trim(name_vi)='' or trim(unit)='')
"
check_zero "business state rows outside known sites" "
  select count(*) from public.business_state where site not in ('central','fuxing','yongji')
"

FULL_ADMIN_KEYS="dashboard inventory procurement reservations preparation menu sop skills attendance schedule reports remote settings"
missing_admin=0
for key in ${FULL_ADMIN_KEYS}; do
  value="$(scalar "select count(*) from public.app_users where role='admin' and (coalesce((permissions->'${key}'->>'view')::boolean,false)=false or coalesce((permissions->'${key}'->>'edit')::boolean,false)=false)")"
  if [[ "${value}" != "0" ]]; then
    echo "ERROR: admin permission '${key}' incomplete on ${value} account(s)"
    missing_admin=$((missing_admin+1))
  fi
done
if [[ "${missing_admin}" != "0" ]]; then errors=$((errors+missing_admin)); else echo "OK: all admin module permissions"; fi

check_zero "admin accounts outside global scope" "select count(*) from public.app_users where role='admin' and location<>'all'"
check_positive "primary admin yangchuadmin restored" "
  select count(*)
  from public.app_users
  where lower(username)='yangchuadmin' and role='admin' and location='all' and active=true
"

warn_nonzero "stock rows whose item key site differs from location site" "
  select count(*)
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  join public.inventory_locations l on l.id=s.location_id
  where split_part(i.item_key,':',1)<>l.site
"
warn_nonzero "duplicate active catalog keys inside the same site" "
  select count(*)
  from (
    select split_part(item_key,':',1) as site,catalog_key
    from public.inventory_items
    where active=true
    group by 1,2
    having count(*)>1
  ) q
"

schema="$(scalar "select coalesce(max(version),'000') from public.schema_migrations")"
if [[ "${schema}" < "005" ]]; then
  echo "ERROR: schema version ${schema} is older than 005"
  errors=$((errors+1))
else
  echo "OK: schema version ${schema}"
fi

echo "Warnings: ${warnings}"
echo "Errors: ${errors}"

if [[ "${errors}" != "0" ]]; then
  echo "DATA_INTEGRITY_FAILED"
  exit 1
fi

echo "DATA_INTEGRITY_OK"
