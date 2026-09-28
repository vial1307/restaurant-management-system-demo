begin;

-- Keep shared catalog Work Area classification aligned with the unique active
-- Central catalog row. Branch-only catalog identities remain site-owned.

create temporary table inventory_branch_work_area_repair on commit drop as
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

-- Do not partially repair a catalog when the branch does not have exactly one
-- active Work Location for Central's canonical Work Area.
do $catalog_workarea_destination_guard$
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
  select string_agg(m.item_key||'->'||m.target_work_area,',' order by m.item_key)
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
$catalog_workarea_destination_guard$;

create temporary table inventory_branch_work_area_repair_before on commit drop as
select
  t.item_id,
  coalesce(sum(s.quantity) filter (where l.kind='work'),0) as work_quantity
from inventory_branch_work_area_repair t
left join public.inventory_stock s on s.item_id=t.item_id
left join public.inventory_locations l on l.id=s.location_id
group by t.item_id;

-- Merge all existing Work Location state into the canonical destination.
with moved as (
  select
    t.item_id,
    t.target_location_id,
    coalesce(sum(s.quantity),0) as quantity,
    coalesce(max(s.minimum_quantity),0) as minimum_quantity
  from inventory_branch_work_area_repair t
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
using inventory_branch_work_area_repair t, public.inventory_locations source
where s.item_id=t.item_id
  and source.id=s.location_id
  and source.site=t.site
  and source.kind='work'
  and source.id<>t.target_location_id;

with updated as (
  update public.inventory_items i
  set work_area=t.target_work_area,
      updated_at=now()
  from inventory_branch_work_area_repair t
  where i.id=t.item_id
  returning
    i.id,
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
  'system_inventory_catalog_work_area_repair',
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
    'migration','029',
    'policy','central_catalog_work_area',
    'catalog_key',u.catalog_key
  )
from updated u;

do $catalog_workarea_quantity_guard$
begin
  if exists (
    select 1
    from inventory_branch_work_area_repair_before b
    where b.work_quantity is distinct from (
      select coalesce(sum(s.quantity),0)
      from public.inventory_stock s
      join public.inventory_locations l on l.id=s.location_id
      where s.item_id=b.item_id
        and l.kind='work'
    )
  ) then
    raise exception 'BRANCH_WORK_AREA_REPAIR_QUANTITY_CHANGED';
  end if;
end;
$catalog_workarea_quantity_guard$;

-- Prevent the same drift from returning through direct SQL, catalog sync or
-- Work Area relocation. Branch-only catalog identities are intentionally free.
create or replace function public.inventory_items_catalog_work_area_guard()
returns trigger
language plpgsql
as $catalog_work_area_guard$
declare
  v_site text;
  v_mode text;
  v_canonical_area text;
  v_canonical_count integer;
  v_conflicts integer;
begin
  if new.active=false then
    return new;
  end if;

  v_site := split_part(new.item_key,':',1);
  select coalesce(s.metadata->>'inventory_mode','')
  into v_mode
  from public.sites s
  where s.code=v_site;

  if coalesce(v_mode,'')='branch' then
    select min(i.work_area),count(distinct i.work_area)::int
    into v_canonical_area,v_canonical_count
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='central'
    where i.active=true
      and i.catalog_key=new.catalog_key;

    if coalesce(v_canonical_count,0)=1
       and new.work_area is distinct from v_canonical_area then
      raise exception 'BRANCH_CATALOG_WORK_AREA_MISMATCH:%:%:%',
        new.catalog_key,new.work_area,v_canonical_area;
    end if;
  elsif coalesce(v_mode,'')='central' then
    select count(*)::int
    into v_conflicts
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    where i.active=true
      and i.catalog_key=new.catalog_key
      and i.work_area is distinct from new.work_area;

    if coalesce(v_conflicts,0)>0 then
      raise exception 'CENTRAL_CATALOG_WORK_AREA_BRANCH_CONFLICT:%:%',
        new.catalog_key,new.work_area;
    end if;

    if exists (
      select 1
      from public.inventory_items i
      join public.sites s
        on s.code=split_part(i.item_key,':',1)
       and s.active=true
       and coalesce(s.metadata->>'inventory_mode','')='central'
      where i.active=true
        and i.catalog_key=new.catalog_key
        and i.id is distinct from new.id
        and i.work_area is distinct from new.work_area
    ) then
      raise exception 'CENTRAL_CATALOG_WORK_AREA_AMBIGUOUS:%',new.catalog_key;
    end if;
  end if;

  return new;
end;
$catalog_work_area_guard$;

drop trigger if exists inventory_items_catalog_work_area_guard on public.inventory_items;
create trigger inventory_items_catalog_work_area_guard
before insert or update of item_key,catalog_key,work_area,active
on public.inventory_items
for each row execute function public.inventory_items_catalog_work_area_guard();

-- Final invariant: every active branch item sharing a unique active Central
-- catalog identity must use the same Work Area and have its matching Work row.
do $catalog_workarea_final_guard$
begin
  if exists (
    with central_catalog as (
      select i.catalog_key,min(i.work_area) as work_area
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
      and i.work_area is distinct from c.work_area
  ) then
    raise exception 'BRANCH_CATALOG_WORK_AREA_MISMATCH_REMAINS';
  end if;

  if exists (
    select 1
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    where i.active=true
      and not exists (
        select 1
        from public.inventory_stock st
        join public.inventory_locations l
          on l.id=st.location_id
         and l.site=s.code
         and l.kind='work'
         and l.active=true
         and l.metadata->>'work_area'=i.work_area
        where st.item_id=i.id
      )
  ) then
    raise exception 'BRANCH_ITEM_WORK_PROJECTION_INCOMPLETE';
  end if;
end;
$catalog_workarea_final_guard$;

commit;
