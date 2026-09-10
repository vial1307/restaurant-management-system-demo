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

# Schema 009 authoritative Fuxing 大冷凍 reconciliation. This is a deployment
# invariant: every user-confirmed row must exist at the exact canonical location
# with the exact quantity and database unit. Other storage/work locations are
# intentionally outside this check and are not inferred or zeroed.
check_zero "canonical Fuxing large-freezer location cardinality" "
  select case when count(*)=1 then 0 else 1 end
  from public.inventory_locations
  where code='fuxing-large-freezer' and site='fuxing' and kind='storage' and active=true
"
check_zero "Fuxing large-freezer authoritative 51-row reconciliation" "
  with expected(item_key, expected_quantity, expected_unit) as (
    values
      ('fuxing:freezer-beef-noodle-broth',20::numeric,'包'),
      ('fuxing:freezer-clear-stew-broth',20,'包'),
      ('fuxing:freezer-kombu-broth-large',21,'包'),
      ('fuxing:freezer-kombu-broth-small',40,'包'),
      ('fuxing:freezer-taro-chicken-soup',5,'包'),
      ('fuxing:freezer-light-mala-broth',78,'包'),
      ('fuxing:freezer-heavy-mala-broth',67,'包'),
      ('fuxing:oxtail-rice',91,'包'),
      ('fuxing:freezer-oxtail-meat-2kg',9,'包'),
      ('fuxing:freezer-beef-bag',7,'包'),
      ('fuxing:freezer-beef-tendon-3kg',0,'包'),
      ('fuxing:freezer-braised-tofu',105,'包'),
      ('fuxing:freezer-braised-duck-wing',57,'包'),
      ('fuxing:freezer-braised-duck-tongue',54,'包'),
      ('fuxing:freezer-braised-duck-intestine',94,'包'),
      ('fuxing:freezer-tiger-skin-chicken-feet',75,'包'),
      ('fuxing:freezer-rice-cake',26,'包'),
      ('fuxing:freezer-tender-beef',17,'包'),
      ('fuxing:freezer-sichuan-mala-broth',35,'包'),
      ('fuxing:freezer-noodle-oil-1kg',57,'包'),
      ('fuxing:freezer-heavy-mala-oil',39,'包'),
      ('fuxing:freezer-yellow-throat',4,'包'),
      ('fuxing:duck-intestine',4,'包'),
      ('fuxing:freezer-frog',31,'包'),
      ('fuxing:freezer-large-intestine',40,'包'),
      ('fuxing:freezer-braised-tripe',110,'包'),
      ('fuxing:freezer-grass-prawn',0,'箱'),
      ('fuxing:freezer-french-bread',71,'條'),
      ('fuxing:freezer-pr-short-rib',1,'塊'),
      ('fuxing:freezer-pr-marbled-beef',0,'塊'),
      ('fuxing:freezer-ch-marbled-beef',1,'塊'),
      ('fuxing:freezer-lamb-shoulder',3,'塊'),
      ('fuxing:freezer-ribeye',3,'塊'),
      ('fuxing:freezer-yellow-beef-brisket',6,'塊'),
      ('fuxing:freezer-wagyu',0,'塊'),
      ('fuxing:freezer-pork-collar-box',7,'條'),
      ('fuxing:freezer-hell-tripe',24,'包'),
      ('fuxing:freezer-rice-sauce-180g',28,'包'),
      ('fuxing:freezer-hell-beef-rice',18,'包'),
      ('fuxing:freezer-sous-vide-steak',44,'包'),
      ('fuxing:freezer-secret-garlic-sauce',50,'包'),
      ('fuxing:freezer-mild-dipping-sauce',20,'包'),
      ('fuxing:frozen-noodles',30,'片'),
      ('fuxing:freezer-crispy-ribs',3,'斤'),
      ('fuxing:freezer-fried-taro',3,'包'),
      ('fuxing:freezer-fried-squid',1,'包'),
      ('fuxing:freezer-buniu-concentrate',3,'包'),
      ('fuxing:freezer-sous-vide-chicken',18,'包'),
      ('fuxing:freezer-pork-knuckle',6,'包'),
      ('fuxing:freezer-sous-vide-pork-shoulder',5,'包'),
      ('fuxing:freezer-croissant',15,'個')
  ), target_location as (
    select id
    from public.inventory_locations
    where code='fuxing-large-freezer' and site='fuxing' and kind='storage' and active=true
  )
  select count(*)
  from expected e
  left join public.inventory_items i
    on i.item_key=e.item_key and i.active=true and i.storage_only=true
  left join target_location l on true
  left join public.inventory_stock s
    on s.item_id=i.id and s.location_id=l.id
  where i.id is null
     or l.id is null
     or s.item_id is null
     or s.quantity is distinct from e.expected_quantity
     or i.unit is distinct from e.expected_unit
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
if [[ "${schema}" < "009" ]]; then
  echo "ERROR: schema version ${schema} is older than 009"
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
