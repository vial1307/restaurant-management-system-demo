begin;

-- Normalize branch item work-area classification from the active Central catalog
-- identity. Migration 025 guarantees that each active Work Area owns exactly one
-- active Work Location, but it intentionally preserves each item's declared
-- work_area. Legacy branch imports can therefore remain internally consistent
-- while still being classified into the wrong business area (for example most
-- items falling back to noodles). This migration fixes that operational master
-- data without inferring from labels.

do $central_catalog_guard$
begin
  if exists (
    select i.catalog_key
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='central'
    where i.active=true
    group by i.catalog_key
    having count(distinct i.work_area)>1
  ) then
    raise exception 'CENTRAL_CATALOG_WORK_AREA_AMBIGUOUS';
  end if;
end;
$central_catalog_guard$;

create temporary table inventory_branch_work_area_sync on commit drop as
with central_catalog as (
  select
    i.catalog_key,
    min(i.work_area) as target_work_area
  from public.inventory_items i
  join public.sites s
    on s.code=split_part(i.item_key,':',1)
   and s.active=true
   and coalesce(s.metadata->>'inventory_mode','')='central'
  where i.active=true
  group by i.catalog_key
  having count(distinct i.work_area)=1
),
branch_items as (
  select
    i.id as item_id,
    i.item_key,
    i.catalog_key,
    split_part(i.item_key,':',1) as site,
    i.work_area as before_work_area,
    c.target_work_area
  from public.inventory_items i
  join public.sites s
    on s.code=split_part(i.item_key,':',1)
   and s.active=true
   and coalesce(s.metadata->>'inventory_mode','')='branch'
  join central_catalog c using(catalog_key)
  where i.active=true
    and i.work_area is distinct from c.target_work_area
)
select
  b.*,
  target.id as target_location_id,
  target.code as target_location_code
from branch_items b
join public.work_areas w
  on w.site_code=b.site
 and w.code=b.target_work_area
 and w.active=true
join public.inventory_locations target
  on target.site=b.site
 and target.kind='work'
 and target.active=true
 and target.metadata->>'work_area'=b.target_work_area;

-- Refuse partial normalization. A mismatch is only safe to move when the
-- destination Work Area and its synchronized Work Location both exist.
do $branch_destination_guard$
declare
  unresolved text;
begin
  with central_catalog as (
    select i.catalog_key,min(i.work_area) as target_work_area
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='central'
    where i.active=true
    group by i.catalog_key
    having count(distinct i.work_area)=1
  ),
  mismatches as (
    select
      i.item_key,
      split_part(i.item_key,':',1) as site,
      i.catalog_key,
      c.target_work_area
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    join central_catalog c using(catalog_key)
    where i.active=true
      and i.work_area is distinct from c.target_work_area
  )
  select string_agg(
    m.item_key||'->'||m.target_work_area,
    ',' order by m.item_key
  )
  into unresolved
  from mismatches m
  where not exists (
    select 1
    from public.work_areas w
    where w.site_code=m.site
      and w.code=m.target_work_area
      and w.active=true
  )
  or (
    select count(*)
    from public.inventory_locations l
    where l.site=m.site
      and l.kind='work'
      and l.active=true
      and l.metadata->>'work_area'=m.target_work_area
  )<>1;

  if unresolved is not null then
    raise exception 'BRANCH_CATALOG_WORK_AREA_DESTINATION_MISSING:%',unresolved;
  end if;
end;
$branch_destination_guard$;

-- Snapshot work totals before moving so the migration can prove it did not
-- change physical quantity.
create temporary table inventory_branch_work_area_before on commit drop as
select
  t.item_id,
  coalesce(sum(s.quantity) filter (where l.kind='work'),0) as work_quantity
from inventory_branch_work_area_sync t
left join public.inventory_stock s on s.item_id=t.item_id
left join public.inventory_locations l on l.id=s.location_id
group by t.item_id;

-- Merge every wrong work-location row into the database-declared target.
with moved as (
  select
    t.item_id,
    t.target_location_id,
    sum(s.quantity) as quantity,
    max(s.minimum_quantity) as minimum_quantity
  from inventory_branch_work_area_sync t
  join public.inventory_stock s on s.item_id=t.item_id
  join public.inventory_locations source on source.id=s.location_id
  where source.site=t.site
    and source.kind='work'
    and source.id<>t.target_location_id
  group by t.item_id,t.target_location_id
)
insert into public.inventory_stock(
  item_id,location_id,quantity,minimum_quantity,updated_at
)
select item_id,target_location_id,quantity,minimum_quantity,now()
from moved
on conflict(item_id,location_id) do update
set quantity=public.inventory_stock.quantity+excluded.quantity,
    minimum_quantity=greatest(public.inventory_stock.minimum_quantity,excluded.minimum_quantity),
    updated_at=now();

delete from public.inventory_stock s
using inventory_branch_work_area_sync t, public.inventory_locations source
where s.item_id=t.item_id
  and source.id=s.location_id
  and source.site=t.site
  and source.kind='work'
  and source.id<>t.target_location_id;

-- Update the branch item master only after stock has a valid destination.
with updated as (
  update public.inventory_items i
  set work_area=t.target_work_area,
      updated_at=now()
  from inventory_branch_work_area_sync t
  where i.id=t.item_id
  returning
    i.id,
    i.item_key,
    i.catalog_key,
    t.site,
    t.before_work_area,
    i.work_area as after_work_area,
    t.target_location_id,
    t.target_location_code
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_catalog_work_area_sync',
  'inventory_item',
  u.id::text,
  u.site,
  jsonb_build_object('work_area',u.before_work_area),
  jsonb_build_object(
    'work_area',u.after_work_area,
    'work_location_id',u.target_location_id,
    'work_location_code',u.target_location_code
  ),
  jsonb_build_object(
    'source','migration_026',
    'policy','central_catalog_work_area',
    'catalog_key',u.catalog_key
  )
from updated u;

-- Quantity must be identical before/after the relocation.
do $quantity_guard$
begin
  if exists (
    select 1
    from inventory_branch_work_area_before b
    where b.work_quantity is distinct from (
      select coalesce(sum(s.quantity),0)
      from public.inventory_stock s
      join public.inventory_locations l on l.id=s.location_id
      where s.item_id=b.item_id
        and l.kind='work'
    )
  ) then
    raise exception 'BRANCH_WORK_AREA_SYNC_QUANTITY_CHANGED';
  end if;
end;
$quantity_guard$;

-- Final cross-site classification invariant for catalog identities that exist
-- in Central. Branch-only catalogs remain site-owned.
do $catalog_work_area_verify$
begin
  if exists (
    with central_catalog as (
      select i.catalog_key,min(i.work_area) as target_work_area
      from public.inventory_items i
      join public.sites s
        on s.code=split_part(i.item_key,':',1)
       and s.active=true
       and coalesce(s.metadata->>'inventory_mode','')='central'
      where i.active=true
      group by i.catalog_key
      having count(distinct i.work_area)=1
    )
    select 1
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    join central_catalog c using(catalog_key)
    where i.active=true
      and i.work_area is distinct from c.target_work_area
  ) then
    raise exception 'BRANCH_CATALOG_WORK_AREA_MISMATCH';
  end if;

  if exists (
    select 1
    from public.inventory_stock s
    join public.inventory_items i on i.id=s.item_id
    join public.inventory_locations l on l.id=s.location_id
    where i.active=true
      and l.active=true
      and l.kind='work'
      and l.metadata->>'work_area'<>i.work_area
  ) then
    raise exception 'WORK_STOCK_AREA_MISMATCH';
  end if;
end;
$catalog_work_area_verify$;

commit;
