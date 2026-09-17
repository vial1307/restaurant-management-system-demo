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
  (select count(*) from public.work_areas where active=true) as active_work_areas,
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
check_positive "operational work areas exist" "select count(*) from public.work_areas where active=true"

check_zero "missing canonical operational location records" "
  with expected(code) as (
    values
      ('central-freezer'),('central-fridge'),('central-four-door'),('central-chest'),('central-work-use'),
      ('fuxing-large-freezer'),('fuxing-large-fridge'),('fuxing-four-door'),('fuxing-kitchen'),
      ('fuxing-work-noodles'),('fuxing-work-soup'),('fuxing-work-seafood'),('fuxing-work-meat'),
      ('yongji-large-freezer'),('yongji-large-fridge'),('yongji-four-door'),('yongji-kitchen'),
      ('yongji-work-noodles'),('yongji-work-soup'),('yongji-work-seafood'),('yongji-work-meat')
  )
  select count(*) from expected e
  left join public.inventory_locations l on l.code=e.code
  where l.id is null
"
check_zero "missing canonical work-area records" "
  with expected(site_code,code) as (
    values
      ('central','noodles'),('central','soup'),('central','seafood'),('central','meat'),
      ('fuxing','noodles'),('fuxing','soup'),('fuxing','seafood'),('fuxing','meat'),
      ('yongji','noodles'),('yongji','soup'),('yongji','seafood'),('yongji','meat')
  )
  select count(*) from expected e
  left join public.work_areas w
    on w.site_code=e.site_code and w.code=e.code
  where w.code is null
"
check_zero "active inventory items missing active work-area master data" "
  select count(*)
  from public.inventory_items i
  where i.active=true
    and split_part(i.item_key,':',1) in ('central','fuxing','yongji')
    and not exists (
      select 1 from public.work_areas w
      where w.site_code=split_part(i.item_key,':',1)
        and w.code=i.work_area
        and w.active=true
    )
"
check_zero "invalid work-area master data labels" "
  select count(*) from public.work_areas
  where trim(name_vi)='' or trim(name_zh_tw)=''
"

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
check_zero "business state module revision maps invalid" "
  select count(*) from public.business_state
  where module_revisions is null or jsonb_typeof(module_revisions)<>'object'
"
check_zero "stored business modules missing revision tokens" "
  select count(*)
  from public.business_state b
  cross join lateral jsonb_object_keys(b.modules) as keys(module_name)
  where not (b.module_revisions ? keys.module_name)
     or jsonb_typeof(b.module_revisions -> keys.module_name)<>'number'
     or case
          when jsonb_typeof(b.module_revisions -> keys.module_name)='number'
          then (b.module_revisions ->> keys.module_name)::numeric < 0
            or (b.module_revisions ->> keys.module_name)::numeric <> trunc((b.module_revisions ->> keys.module_name)::numeric)
          else false
        end
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
check_positive "primary super admin yangchuadmin restored" "
  select count(*)
  from public.app_users
  where lower(username)='yangchuadmin' and role='superadmin' and location='all' and active=true
"
check_positive "superadmin system-owner capability grant exists" "
  select count(*) from public.role_capabilities
  where role_code='superadmin' and capability_key='system.super_admin' and allowed=true
"
check_positive "admin master-data capability grant exists" "
  select count(*) from public.role_capabilities
  where role_code='admin' and capability_key='system.master_data.manage' and allowed=true
"
check_positive "manager location-management grant exists" "
  select count(*) from public.role_capabilities
  where role_code='manager' and capability_key='inventory.locations.manage' and allowed=true
"
check_positive "manager work-area-management grant exists" "
  select count(*) from public.role_capabilities
  where role_code='manager' and capability_key='operations.work_areas.manage' and allowed=true
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
if [[ "${schema}" < "015" ]]; then
  echo "ERROR: schema version ${schema} is older than 015"
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
