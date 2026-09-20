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
check_zero "inactive inventory items with positive quantity" "
  select count(*)
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  where i.active=false and s.quantity>0
"
check_zero "inactive inventory items with positive minimum" "
  select count(*)
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  where i.active=false and s.minimum_quantity>0
"
check_zero "inactive inventory locations with protected stock/config" "
  select count(*)
  from public.inventory_stock s
  join public.inventory_locations l on l.id=s.location_id
  where l.active=false and (s.quantity>0 or s.minimum_quantity>0)
"
check_zero "receive defaults pointing to wrong site/non-storage" "
  select count(*)
  from public.inventory_receive_defaults d
  join public.inventory_locations l on l.id=d.location_id
  where l.site<>d.site or l.kind<>'storage' or l.active=false
"
check_zero "receive defaults without matching active inventory item" "
  select count(*)
  from public.inventory_receive_defaults d
  where not exists (
    select 1
    from public.inventory_items i
    where i.active=true
      and split_part(i.item_key,':',1)=d.site
      and i.catalog_key=d.catalog_key
  )
"
check_zero "receive defaults not configured on selected location" "
  select count(*)
  from public.inventory_receive_defaults d
  where not exists (
    select 1
    from public.inventory_items i
    join public.inventory_stock s on s.item_id=i.id
    where i.active=true
      and split_part(i.item_key,':',1)=d.site
      and i.catalog_key=d.catalog_key
      and s.location_id=d.location_id
  )
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

check_zero "stock rows whose item key site differs from location site" "
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

warn_nonzero "cross-site inventory catalog identity name variants" "
  select count(*)
  from (
    select catalog_key
    from public.inventory_items
    where active=true
      and split_part(item_key,':',1) in (
        select code from public.sites
        where active=true
          and coalesce(metadata->>'inventory_mode','') in ('central','branch')
      )
    group by catalog_key
    having count(distinct split_part(item_key,':',1)) > 1
       and (
         count(distinct name_vi) > 1
         or count(distinct name_zh_tw) > 1
       )
  ) q
"
operational_variants="$(scalar "
  select count(*)
  from (
    select catalog_key
    from public.inventory_items
    where active=true
      and split_part(item_key,':',1) in (
        select code from public.sites
        where active=true
          and coalesce(metadata->>'inventory_mode','') in ('central','branch')
      )
    group by catalog_key
    having count(distinct split_part(item_key,':',1)) > 1
       and (
         count(distinct unit) > 1
         or count(distinct work_area) > 1
         or count(distinct storage_only) > 1
       )
  ) q
")"
echo "INFO: cross-site inventory operational variants: ${operational_variants}"
warn_nonzero "branch multi-location items missing fixed receive default" "
  with configured as (
    select
      i.id,
      split_part(i.item_key,':',1) as site,
      i.catalog_key,
      count(distinct l.id) filter (
        where l.active=true and l.kind='storage'
      ) as storage_locations
    from public.inventory_items i
    left join public.inventory_stock s on s.item_id=i.id
    left join public.inventory_locations l on l.id=s.location_id
    where i.active=true
    group by i.id,i.item_key,i.catalog_key
  )
  select count(*)
  from configured c
  join public.sites site on site.code=c.site
  where site.active=true
    and site.metadata->>'inventory_mode'='branch'
    and c.storage_locations > 1
    and not exists (
      select 1
      from public.inventory_receive_defaults d
      where d.site=c.site and d.catalog_key=c.catalog_key
    )
"
warn_nonzero "active inventory items without configured storage" "
  select count(*)
  from public.inventory_items i
  where i.active=true
    and split_part(i.item_key,':',1) in (
      select code from public.sites
      where active=true
        and coalesce(metadata->>'inventory_mode','') in ('central','branch')
    )
    and not exists (
      select 1
      from public.inventory_stock s
      join public.inventory_locations l on l.id=s.location_id
      where s.item_id=i.id
        and l.active=true
        and l.kind='storage'
    )
"


echo "=== Inventory catalog synchronization detail ==="
echo "--- Identity name drift ---"
"${psql_base[@]}" -c "
with variants as (
  select
    catalog_key,
    array_agg(distinct split_part(item_key,':',1) order by split_part(item_key,':',1)) as sites,
    array_agg(distinct name_vi order by name_vi) as names_vi,
    array_agg(distinct name_zh_tw order by name_zh_tw) as names_zh_tw
  from public.inventory_items
  where active=true
    and split_part(item_key,':',1) in (
      select code from public.sites
      where active=true
        and coalesce(metadata->>'inventory_mode','') in ('central','branch')
    )
  group by catalog_key
)
select catalog_key,sites,names_vi,names_zh_tw
from variants
where cardinality(sites) > 1
  and (
    cardinality(names_vi) > 1
    or cardinality(names_zh_tw) > 1
  )
order by catalog_key
limit 100;
"

echo "--- Operational variants (informational) ---"
"${psql_base[@]}" -c "
with variants as (
  select
    catalog_key,
    array_agg(distinct split_part(item_key,':',1) order by split_part(item_key,':',1)) as sites,
    array_agg(distinct unit order by unit) as units,
    array_agg(distinct work_area order by work_area) as work_areas,
    array_agg(distinct storage_only order by storage_only) as storage_only_values
  from public.inventory_items
  where active=true
    and split_part(item_key,':',1) in (
      select code from public.sites
      where active=true
        and coalesce(metadata->>'inventory_mode','') in ('central','branch')
    )
  group by catalog_key
)
select catalog_key,sites,units,work_areas,storage_only_values
from variants
where cardinality(sites) > 1
  and (
    cardinality(units) > 1
    or cardinality(work_areas) > 1
    or cardinality(storage_only_values) > 1
  )
order by catalog_key
limit 100;
"

echo "--- Per-site rows for all cross-site variants ---"
"${psql_base[@]}" -c "
with variant_keys as (
  select catalog_key
  from public.inventory_items
  where active=true
    and split_part(item_key,':',1) in (
      select code from public.sites
      where active=true
        and coalesce(metadata->>'inventory_mode','') in ('central','branch')
    )
  group by catalog_key
  having count(distinct split_part(item_key,':',1)) > 1
     and (
       count(distinct name_vi) > 1
       or count(distinct name_zh_tw) > 1
       or count(distinct unit) > 1
       or count(distinct work_area) > 1
       or count(distinct storage_only) > 1
     )
)
select
  i.catalog_key,
  split_part(i.item_key,':',1) as site,
  i.item_key,
  i.name_vi,
  i.name_zh_tw,
  i.unit,
  i.work_area,
  i.storage_only
from public.inventory_items i
join variant_keys v on v.catalog_key=i.catalog_key
where i.active=true
order by i.catalog_key,site,i.item_key
limit 300;
"

echo "--- Missing fixed receive defaults ---"
"${psql_base[@]}" -c "
with configured as (
  select
    i.id,
    split_part(i.item_key,':',1) as site,
    i.catalog_key,
    i.name_zh_tw,
    count(distinct l.id) filter (where l.active=true and l.kind='storage') as storage_locations,
    string_agg(distinct l.code,', ' order by l.code) filter (where l.active=true and l.kind='storage') as storage_codes
  from public.inventory_items i
  left join public.inventory_stock s on s.item_id=i.id
  left join public.inventory_locations l on l.id=s.location_id
  where i.active=true
  group by i.id,i.item_key,i.catalog_key,i.name_zh_tw
)
select c.site,c.catalog_key,c.name_zh_tw,c.storage_codes
from configured c
join public.sites site on site.code=c.site
where site.active=true
  and site.metadata->>'inventory_mode'='branch'
  and c.storage_locations > 1
  and not exists (
    select 1 from public.inventory_receive_defaults d
    where d.site=c.site and d.catalog_key=c.catalog_key
  )
order by c.site,c.catalog_key
limit 80;
"

echo "--- Items without configured storage ---"
"${psql_base[@]}" -c "
select
  split_part(i.item_key,':',1) as site,
  i.catalog_key,
  i.item_key,
  i.name_zh_tw,
  i.unit,
  i.work_area
from public.inventory_items i
where i.active=true
  and split_part(i.item_key,':',1) in (
    select code from public.sites
    where active=true
      and coalesce(metadata->>'inventory_mode','') in ('central','branch')
  )
  and not exists (
    select 1
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=i.id
      and l.active=true
      and l.kind='storage'
  )
order by site,i.catalog_key
limit 80;
"

schema="$(scalar "select coalesce(max(version),'000') from public.schema_migrations")"
if [[ "${schema}" < "025" ]]; then
  echo "ERROR: schema version ${schema} is older than 025"
  errors=$((errors+1))
else
  echo "OK: schema version ${schema}"
fi

inventory_site_triggers="$(scalar "select count(distinct trigger_name) from information_schema.triggers where trigger_schema='public' and trigger_name in ('inventory_items_site_guard','inventory_stock_site_guard','inventory_receive_defaults_site_guard')")"
inventory_archive_triggers="$(scalar "select count(distinct trigger_name) from information_schema.triggers where trigger_schema='public' and trigger_name in ('inventory_items_archive_guard','inventory_stock_active_item_guard')")"
inventory_location_integrity_triggers="$(scalar "select count(distinct trigger_name) from information_schema.triggers where trigger_schema='public' and trigger_name in ('inventory_locations_archive_guard','inventory_stock_active_location_guard','inventory_receive_defaults_active_location_guard')")"
inventory_units_table="$(scalar "select count(*) from information_schema.tables where table_schema='public' and table_name='inventory_units'")"
inventory_units_active="$(scalar "select count(*) from public.inventory_units where active=true")"
inventory_units_fk="$(scalar "select count(*) from pg_constraint where conname='inventory_items_unit_fkey' and conrelid='public.inventory_items'::regclass and confrelid='public.inventory_units'::regclass")"
if [[ "${inventory_site_triggers}" != "3" ]]; then
  echo "ERROR: expected 3 inventory site-isolation triggers, found ${inventory_site_triggers}"
  errors=$((errors+1))
else
  echo "OK: inventory site-isolation triggers = 3"
fi

if [[ "${inventory_archive_triggers}" != "2" ]]; then
  echo "ERROR: expected 2 inventory archive-integrity triggers, found ${inventory_archive_triggers}"
  errors=$((errors+1))
else
  echo "OK: inventory archive-integrity triggers = 2"
fi

if [[ "${inventory_location_integrity_triggers}" != "3" ]]; then
  echo "ERROR: expected 3 inventory location-integrity triggers, found ${inventory_location_integrity_triggers}"
  errors=$((errors+1))
else
  echo "OK: inventory location-integrity triggers = 3"
fi

if [[ "${inventory_units_table}" != "1" ]]; then
  echo "ERROR: inventory_units master table is missing"
  errors=$((errors+1))
else
  echo "OK: inventory_units master table exists"
fi

if [[ "${inventory_units_active}" -lt "1" ]]; then
  echo "ERROR: inventory_units has no active unit"
  errors=$((errors+1))
else
  echo "OK: active inventory units = ${inventory_units_active}"
fi

if [[ "${inventory_units_fk}" != "1" ]]; then
  echo "ERROR: inventory_items.unit is not protected by inventory_units FK"
  errors=$((errors+1))
else
  echo "OK: inventory_items unit FK = 1"
fi

revision_columns="$(scalar "select count(*) from information_schema.columns where table_schema='public' and column_name='revision' and table_name in ('system_announcements','media_assets','menu_items','inventory_items','sop_documents')")"
if [[ "${revision_columns}" != "5" ]]; then
  echo "ERROR: expected 5 Super Admin revision columns, found ${revision_columns}"
  errors=$((errors+1))
else
  echo "OK: Super Admin revision columns = 5"
fi

revision_triggers="$(scalar "select count(*) from information_schema.triggers where trigger_schema='public' and action_timing='BEFORE' and event_manipulation='UPDATE' and trigger_name in ('system_announcements_bump_revision','media_assets_bump_revision','menu_items_bump_revision','inventory_items_bump_revision','sop_documents_bump_revision')")"
if [[ "${revision_triggers}" != "5" ]]; then
  echo "ERROR: expected 5 Super Admin revision triggers, found ${revision_triggers}"
  errors=$((errors+1))
else
  echo "OK: Super Admin revision triggers = 5"
fi

echo "Warnings: ${warnings}"
echo "Errors: ${errors}"

if [[ "${errors}" != "0" ]]; then
  echo "DATA_INTEGRITY_FAILED"
  exit 1
fi

echo "DATA_INTEGRITY_OK"
