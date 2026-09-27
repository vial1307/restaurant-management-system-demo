begin;

-- Three-site inventory master-data parity.
--
-- PostgreSQL remains the only business authority. This migration aligns the
-- work-area/work-location topology for every active inventory site, migrates
-- deterministic historical work-area drift into database master data, and
-- hardens the database so Super Admin cannot recreate an invalid mapping.
--
-- Units are intentionally not normalized here: packaging can legitimately
-- differ by site.

create temporary table inventory_catalog_work_area_target (
  catalog_key text primary key,
  work_area text not null,
  policy text not null
) on commit drop;

-- Each physical site gets one vote. A strict site majority can normalize an
-- outlier without allowing duplicate rows in one site to outweigh another.
with site_rows as (
  select
    split_part(i.item_key,':',1) as site,
    i.catalog_key,
    i.work_area
  from public.inventory_items i
  join public.sites s
    on s.code=split_part(i.item_key,':',1)
   and s.active=true
   and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
  where i.active=true
),
catalog_sites as (
  select catalog_key,count(distinct site)::int as site_count
  from site_rows
  group by catalog_key
),
votes as (
  select catalog_key,work_area,count(distinct site)::int as votes
  from site_rows
  group by catalog_key,work_area
)
insert into inventory_catalog_work_area_target(catalog_key,work_area,policy)
select v.catalog_key,v.work_area,'strict_site_majority'
from votes v
join catalog_sites c using(catalog_key)
where v.votes * 2 > c.site_count;

-- These two historical two-site ties were previously resolved only by source
-- defaults. Persist the operational decision in PostgreSQL instead.
insert into inventory_catalog_work_area_target(catalog_key,work_area,policy) values
  ('大腸','seafood','source_default_migrated'),
  ('高麗菜','noodles','source_default_migrated')
on conflict(catalog_key) do nothing;

with targets as (
  select
    i.id,
    i.item_key,
    i.catalog_key,
    split_part(i.item_key,':',1) as site,
    i.work_area as before_work_area,
    t.work_area as after_work_area,
    t.policy
  from public.inventory_items i
  join inventory_catalog_work_area_target t using(catalog_key)
  where i.active=true
    and i.work_area is distinct from t.work_area
    and exists (
      select 1
      from public.work_areas w
      where w.site_code=split_part(i.item_key,':',1)
        and w.code=t.work_area
        and w.active=true
    )
),
updated as (
  update public.inventory_items i
  set work_area=t.after_work_area,
      updated_at=now()
  from targets t
  where i.id=t.id
  returning i.id,i.item_key,i.catalog_key,t.site,t.before_work_area,
            i.work_area as after_work_area,t.policy
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_work_area_parity',
  'inventory_item',
  u.id::text,
  u.site,
  jsonb_build_object('work_area',u.before_work_area),
  jsonb_build_object('work_area',u.after_work_area),
  jsonb_build_object(
    'source','migration_025',
    'policy',u.policy,
    'catalog_key',u.catalog_key,
    'item_key',u.item_key
  )
from updated u;

-- Every active work-area master row must have exactly one active work location.
-- Existing valid custom location codes are preserved; only missing mappings get
-- a canonical <site>-work-<area> code.
insert into public.inventory_locations(
  code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
)
select
  w.site_code||'-work-'||w.code,
  w.name_zh_tw,
  w.name_vi,
  w.site_code,
  'work',
  90 + w.sort_order,
  true,
  jsonb_build_object(
    'canonical',true,
    'ui_key',w.code,
    'work_area',w.code
  )
from public.work_areas w
join public.sites s
  on s.code=w.site_code
 and s.active=true
 and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
where w.active=true
  and not exists (
    select 1
    from public.inventory_locations l
    where l.site=w.site_code
      and l.kind='work'
      and l.active=true
      and btrim(coalesce(l.metadata->>'work_area',''))=w.code
  )
on conflict(code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind='work',
  sort_order=excluded.sort_order,
  active=true,
  metadata=public.inventory_locations.metadata || excluded.metadata,
  updated_at=now();

-- Keep work-location labels and UI metadata derived from work-area master data.
update public.inventory_locations l
set name_zh_tw=w.name_zh_tw,
    name_vi=w.name_vi,
    sort_order=90+w.sort_order,
    metadata=coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object(
      'ui_key',w.code,
      'work_area',w.code
    ),
    updated_at=now()
from public.work_areas w
where l.site=w.site_code
  and l.kind='work'
  and l.active=true
  and w.active=true
  and btrim(coalesce(l.metadata->>'work_area',''))=w.code;

-- Capture work-stock moves before changing rows so the migration is auditable.
create temporary table inventory_work_stock_moves on commit drop as
select
  stock.item_id,
  source.id as source_location_id,
  target.id as destination_location_id,
  stock.quantity,
  stock.minimum_quantity,
  stock.updated_at,
  split_part(item.item_key,':',1) as site,
  item.catalog_key,
  item.work_area
from public.inventory_stock stock
join public.inventory_items item on item.id=stock.item_id
join public.inventory_locations source on source.id=stock.location_id
join lateral (
  select l.id
  from public.inventory_locations l
  where l.site=split_part(item.item_key,':',1)
    and l.kind='work'
    and l.active=true
    and btrim(coalesce(l.metadata->>'work_area',''))=item.work_area
  order by l.sort_order,l.code
  limit 1
) target on true
where source.kind='work'
  and source.id<>target.id
  and btrim(coalesce(source.metadata->>'work_area','')) is distinct from item.work_area;

with moves as (
  select
    item_id,
    destination_location_id,
    sum(quantity) as quantity,
    max(minimum_quantity) as minimum_quantity,
    max(updated_at) as updated_at
  from inventory_work_stock_moves
  group by item_id,destination_location_id
)
insert into public.inventory_stock(
  item_id,location_id,quantity,minimum_quantity,updated_at
)
select item_id,destination_location_id,quantity,minimum_quantity,updated_at
from moves
on conflict(item_id,location_id) do update set
  quantity=public.inventory_stock.quantity + excluded.quantity,
  minimum_quantity=greatest(public.inventory_stock.minimum_quantity,excluded.minimum_quantity),
  updated_at=greatest(public.inventory_stock.updated_at,excluded.updated_at);

delete from public.inventory_stock stock
using inventory_work_stock_moves move
where stock.item_id=move.item_id
  and stock.location_id=move.source_location_id;

insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_work_stock_relocation',
  'inventory_stock',
  move.item_id::text||':'||move.source_location_id::text,
  move.site,
  jsonb_build_object(
    'location_id',move.source_location_id,
    'quantity',move.quantity,
    'minimum_quantity',move.minimum_quantity
  ),
  jsonb_build_object(
    'location_id',move.destination_location_id,
    'quantity',move.quantity,
    'minimum_quantity',move.minimum_quantity
  ),
  jsonb_build_object(
    'source','migration_025',
    'catalog_key',move.catalog_key,
    'work_area',move.work_area
  )
from inventory_work_stock_moves move;

-- Retire generic/orphaned work locations after their protected stock is moved.
-- Historical transactions retain their location UUID and remain readable.
update public.inventory_locations l
set active=false,
    metadata=coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object(
      'legacy',true,
      'retired_by','migration_025'
    ),
    updated_at=now()
where l.active=true
  and l.kind='work'
  and not exists (
    select 1
    from public.work_areas w
    where w.site_code=l.site
      and w.active=true
      and w.code=btrim(coalesce(l.metadata->>'work_area',''))
  );

-- Backfill branch receiving defaults only where topology gives exactly one
-- primary storage location. Explicit manager-owned defaults are never replaced.
with configured as (
  select
    split_part(i.item_key,':',1) as site,
    i.catalog_key,
    count(distinct l.id) filter (
      where l.active=true and l.kind='storage'
    ) as storage_location_count,
    count(distinct l.id) filter (
      where l.active=true
        and l.kind='storage'
        and coalesce(l.metadata->>'storage_group','service')='primary'
    ) as primary_location_count,
    min(l.id::text) filter (
      where l.active=true
        and l.kind='storage'
        and coalesce(l.metadata->>'storage_group','service')='primary'
    )::uuid as primary_location_id
  from public.inventory_items i
  join public.sites site
    on site.code=split_part(i.item_key,':',1)
   and site.active=true
   and site.metadata->>'inventory_mode'='branch'
  left join public.inventory_stock stock on stock.item_id=i.id
  left join public.inventory_locations l on l.id=stock.location_id
  where i.active=true
  group by split_part(i.item_key,':',1),i.catalog_key
),
inserted as (
  insert into public.inventory_receive_defaults(
    site,catalog_key,location_id,updated_by,updated_at
  )
  select c.site,c.catalog_key,c.primary_location_id,null,now()
  from configured c
  where c.storage_location_count>1
    and c.primary_location_count=1
    and c.primary_location_id is not null
    and not exists (
      select 1
      from public.inventory_receive_defaults d
      where d.site=c.site and d.catalog_key=c.catalog_key
    )
  on conflict(site,catalog_key) do nothing
  returning site,catalog_key,location_id,updated_at
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_receive_default_backfill',
  'inventory_receive_default',
  inserted.site||':'||inserted.catalog_key,
  inserted.site,
  null,
  jsonb_build_object(
    'site',inserted.site,
    'catalog_key',inserted.catalog_key,
    'location_id',inserted.location_id,
    'updated_at',inserted.updated_at
  ),
  jsonb_build_object(
    'source','migration_025',
    'policy','unique_primary_storage'
  )
from inserted;

-- Active work locations must map to active work-area master data in the same
-- site. Super Admin/API writes cannot recreate generic orphan locations.
create or replace function public.assert_inventory_location_work_area_master()
returns trigger
language plpgsql
as $$
declare
  area_code text;
begin
  if new.active=true and new.kind='work' then
    area_code := btrim(coalesce(new.metadata->>'work_area',''));
    if area_code='' or not exists (
      select 1
      from public.work_areas w
      where w.site_code=new.site
        and w.code=area_code
        and w.active=true
    ) then
      raise exception using
        errcode='23503',
        message='INVENTORY_WORK_LOCATION_AREA_INVALID',
        detail=format('site=%s code=%s work_area=%s',new.site,new.code,area_code);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_locations_work_area_guard on public.inventory_locations;
create trigger inventory_locations_work_area_guard
before insert or update of site,kind,active,metadata on public.inventory_locations
for each row execute function public.assert_inventory_location_work_area_master();

-- Protected stock in a work location must match the item's site/work_area.
create or replace function public.assert_inventory_stock_work_area_alignment()
returns trigger
language plpgsql
as $$
declare
  item_site text;
  item_area text;
  location_site text;
  location_kind text;
  location_area text;
begin
  if new.quantity<=0 and new.minimum_quantity<=0 then
    return new;
  end if;

  select split_part(i.item_key,':',1),i.work_area
    into item_site,item_area
  from public.inventory_items i
  where i.id=new.item_id;

  select l.site,l.kind,btrim(coalesce(l.metadata->>'work_area',''))
    into location_site,location_kind,location_area
  from public.inventory_locations l
  where l.id=new.location_id;

  if location_kind='work'
     and (
       location_site is distinct from item_site
       or location_area is distinct from item_area
     ) then
    raise exception using
      errcode='23514',
      message='INVENTORY_WORK_STOCK_AREA_MISMATCH',
      detail=format(
        'item_id=%s item_site=%s item_area=%s location_id=%s location_site=%s location_area=%s',
        new.item_id,item_site,item_area,new.location_id,location_site,location_area
      );
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_stock_work_area_guard on public.inventory_stock;
create trigger inventory_stock_work_area_guard
before insert or update of item_id,location_id,quantity,minimum_quantity on public.inventory_stock
for each row execute function public.assert_inventory_stock_work_area_alignment();

-- A work_area edit with protected work stock must be explicit: clear/move stock
-- through the inventory transaction path first instead of silently stranding it.
create or replace function public.assert_inventory_item_work_area_change_safe()
returns trigger
language plpgsql
as $$
begin
  if new.work_area is distinct from old.work_area and exists (
    select 1
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=old.id
      and l.kind='work'
      and (s.quantity>0 or s.minimum_quantity>0)
      and btrim(coalesce(l.metadata->>'work_area','')) is distinct from new.work_area
  ) then
    raise exception using
      errcode='23514',
      message='INVENTORY_WORK_AREA_HAS_PROTECTED_STOCK',
      detail=format('item_id=%s before=%s after=%s',old.id,old.work_area,new.work_area);
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_work_area_stock_guard on public.inventory_items;
create trigger inventory_items_work_area_stock_guard
before update of work_area on public.inventory_items
for each row execute function public.assert_inventory_item_work_area_change_safe();

-- Fail deployment rather than leave a partially synchronized topology.
do $$
begin
  if exists (
    select 1
    from public.work_areas w
    join public.sites s
      on s.code=w.site_code
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
    where w.active=true
      and not exists (
        select 1
        from public.inventory_locations l
        where l.site=w.site_code
          and l.kind='work'
          and l.active=true
          and btrim(coalesce(l.metadata->>'work_area',''))=w.code
      )
  ) then
    raise exception using message='INVENTORY_WORK_LOCATION_PARITY_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.inventory_locations l
    where l.active=true
      and l.kind='work'
      and not exists (
        select 1
        from public.work_areas w
        where w.site_code=l.site
          and w.code=btrim(coalesce(l.metadata->>'work_area',''))
          and w.active=true
      )
  ) then
    raise exception using message='INVENTORY_WORK_LOCATION_ORPHANED';
  end if;

  if exists (
    select 1
    from public.inventory_stock stock
    join public.inventory_items item on item.id=stock.item_id
    join public.inventory_locations location on location.id=stock.location_id
    where location.kind='work'
      and (stock.quantity>0 or stock.minimum_quantity>0)
      and (
        location.site<>split_part(item.item_key,':',1)
        or btrim(coalesce(location.metadata->>'work_area',''))<>item.work_area
      )
  ) then
    raise exception using message='INVENTORY_WORK_STOCK_PARITY_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
    where i.active=true
    group by i.catalog_key
    having count(distinct split_part(i.item_key,':',1))>1
       and count(distinct i.work_area)>1
  ) then
    raise exception using message='INVENTORY_CROSS_SITE_WORK_AREA_PARITY_INCOMPLETE';
  end if;
end;
$$;

commit;
