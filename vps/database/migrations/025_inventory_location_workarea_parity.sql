begin;

-- Inventory work-location parity is database master data.
-- Every active work area for an inventory site must have exactly one active
-- work location, and every work-stock row must live at the location that
-- matches inventory_items.work_area.

-- Create/reactivate a canonical work location only when the site/work area
-- does not already have an active mapping. Existing custom location codes are
-- preserved when they already map to the work area.
insert into public.inventory_locations(
  code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
)
select
  w.site_code || '-work-' || w.code,
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
join public.sites s on s.code=w.site_code
where w.active=true
  and s.active=true
  and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
  and not exists (
    select 1
    from public.inventory_locations l
    where l.site=w.site_code
      and l.kind='work'
      and l.active=true
      and nullif(btrim(l.metadata->>'work_area'),'')=w.code
  )
on conflict(code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  kind='work',
  sort_order=excluded.sort_order,
  active=true,
  metadata=coalesce(public.inventory_locations.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'canonical',true,
      'ui_key',excluded.metadata->>'ui_key',
      'work_area',excluded.metadata->>'work_area'
    ),
  updated_at=now()
where public.inventory_locations.site=excluded.site
  and public.inventory_locations.kind='work';

-- Move any work stock recorded at a location that does not match the item's
-- declared work area. This includes the historical central-work-use location.
-- Quantities are additive, safety minimums use the stricter value, and every
-- positive quantity move is recorded as an inventory transfer.
do $migration$
declare
  r record;
  destination record;
  destination_before numeric(14,3);
  destination_minimum_before numeric(14,3);
  destination_after numeric(14,3);
  destination_minimum_after numeric(14,3);
begin
  for r in
    select
      s.item_id,
      s.location_id as source_location_id,
      s.quantity,
      s.minimum_quantity,
      i.item_key,
      i.catalog_key,
      i.work_area,
      l.site,
      l.code as source_code,
      nullif(btrim(l.metadata->>'work_area'),'') as source_work_area
    from public.inventory_stock s
    join public.inventory_items i on i.id=s.item_id
    join public.inventory_locations l on l.id=s.location_id
    where i.active=true
      and l.active=true
      and l.kind='work'
      and (
        nullif(btrim(l.metadata->>'work_area'),'') is null
        or nullif(btrim(l.metadata->>'work_area'),'')<>i.work_area
      )
    order by l.site,i.item_key,l.code
  loop
    select l.id,l.code
      into destination
    from public.inventory_locations l
    where l.site=r.site
      and l.kind='work'
      and l.active=true
      and nullif(btrim(l.metadata->>'work_area'),'')=r.work_area
    order by l.sort_order,l.code
    limit 1;

    if destination.id is null then
      raise exception using
        errcode='23503',
        message='INVENTORY_WORK_LOCATION_NOT_FOUND',
        detail=format(
          'site=%s item_key=%s work_area=%s source_location=%s',
          r.site,r.item_key,r.work_area,r.source_code
        );
    end if;

    select quantity,minimum_quantity
      into destination_before,destination_minimum_before
    from public.inventory_stock
    where item_id=r.item_id and location_id=destination.id
    for update;

    destination_before := coalesce(destination_before,0);
    destination_minimum_before := coalesce(destination_minimum_before,0);
    destination_after := destination_before + r.quantity;
    destination_minimum_after := greatest(destination_minimum_before,r.minimum_quantity);

    insert into public.inventory_stock as target(
      item_id,location_id,quantity,minimum_quantity,updated_at
    ) values(
      r.item_id,destination.id,r.quantity,r.minimum_quantity,now()
    )
    on conflict(item_id,location_id) do update set
      quantity=target.quantity + excluded.quantity,
      minimum_quantity=greatest(target.minimum_quantity,excluded.minimum_quantity),
      updated_at=now();

    if r.quantity>0 then
      insert into public.inventory_transactions(
        item_id,source_location_id,destination_location_id,action,amount,note,
        actor_user_id,actor_username,metadata
      ) values(
        r.item_id,r.source_location_id,destination.id,'transfer',r.quantity,
        'Migration 025: normalize work location / 統一工作區儲位',
        null,'system:migration-025',
        jsonb_build_object(
          'source','migration_025',
          'site',r.site,
          'catalog_key',r.catalog_key,
          'work_area',r.work_area,
          'source_work_area',r.source_work_area,
          'source_before',r.quantity,
          'source_after',0,
          'destination_before',destination_before,
          'destination_after',destination_after
        )
      );
    end if;

    insert into public.audit_logs(
      actor_user_id,actor_username,action,entity_type,entity_id,site,
      before_data,after_data,metadata
    ) values(
      null,'system:migration-025',
      'inventory_work_location_normalize','inventory_stock',
      r.item_id::text || ':' || r.source_location_id::text,r.site,
      jsonb_build_object(
        'item_key',r.item_key,
        'location_code',r.source_code,
        'work_area',r.source_work_area,
        'quantity',r.quantity,
        'minimum_quantity',r.minimum_quantity
      ),
      jsonb_build_object(
        'item_key',r.item_key,
        'location_code',destination.code,
        'work_area',r.work_area,
        'quantity',destination_after,
        'minimum_quantity',destination_minimum_after
      ),
      jsonb_build_object('migration','025_inventory_location_workarea_parity')
    );

    delete from public.inventory_stock
    where item_id=r.item_id and location_id=r.source_location_id;
  end loop;
end;
$migration$;

-- Retire active work locations that do not map to an active work-area master
-- row. Historical transactions keep their location UUID/code references.
with retiring as (
  select l.id,l.site,l.code,l.metadata
  from public.inventory_locations l
  where l.active=true
    and l.kind='work'
    and not exists (
      select 1
      from public.work_areas w
      where w.site_code=l.site
        and w.code=nullif(btrim(l.metadata->>'work_area'),'')
        and w.active=true
    )
    and not exists (
      select 1
      from public.inventory_stock s
      where s.location_id=l.id
        and (s.quantity>0 or s.minimum_quantity>0)
    )
),
audited as (
  insert into public.audit_logs(
    actor_user_id,actor_username,action,entity_type,entity_id,site,
    before_data,after_data,metadata
  )
  select
    null,'system:migration-025','master_location_archive_migration',
    'inventory_location',r.id::text,r.site,
    jsonb_build_object('code',r.code,'active',true,'metadata',r.metadata),
    jsonb_build_object(
      'code',r.code,
      'active',false,
      'metadata',coalesce(r.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'legacy',true,
          'retired_reason','invalid_work_area_mapping',
          'retired_by','migration_025'
        )
    ),
    jsonb_build_object('migration','025_inventory_location_workarea_parity')
  from retiring r
  returning entity_id
)
update public.inventory_locations l
set active=false,
    metadata=coalesce(l.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'legacy',true,
        'retired_reason','invalid_work_area_mapping',
        'retired_by','migration_025'
      ),
    updated_at=now()
where l.id::text in (select entity_id from audited);

-- Work-area archival must not leave an active work location orphaned.
create or replace function public.work_area_archive_guard()
returns trigger
language plpgsql
as $$
begin
  if old.active=true and new.active=false and (
    exists (
      select 1
      from public.inventory_items i
      where i.active=true
        and split_part(i.item_key,':',1)=old.site_code
        and i.work_area=old.code
    )
    or exists (
      select 1
      from public.inventory_locations l
      where l.active=true
        and l.site=old.site_code
        and l.kind='work'
        and nullif(btrim(l.metadata->>'work_area'),'')=old.code
    )
  ) then
    raise exception using
      errcode='23503',
      message='WORK_AREA_IN_USE';
  end if;
  return new;
end;
$$;

drop trigger if exists work_areas_archive_guard on public.work_areas;
create trigger work_areas_archive_guard
before update of active on public.work_areas
for each row execute function public.work_area_archive_guard();

-- Location metadata itself must be valid database master data. Validate
-- after the existing inventory_locations_ui_metadata_defaults BEFORE trigger
-- has had a chance to derive ui_key/storage_group/work_area.
create or replace function public.inventory_location_master_parity_guard()
returns trigger
language plpgsql
as $
declare
  location_work_area text;
  storage_group text;
begin
  if new.kind='storage' and new.active=true then
    storage_group := nullif(btrim(coalesce(new.metadata,'{}'::jsonb)->>'storage_group'),'');
    if storage_group is null or storage_group not in ('primary','service') then
      raise exception using
        errcode='23514',
        message='INVENTORY_STORAGE_GROUP_INVALID',
        detail=format('site=%s code=%s storage_group=%s',new.site,new.code,coalesce(storage_group,''));
    end if;
  elsif new.kind='work' and new.active=true then
    location_work_area := nullif(btrim(coalesce(new.metadata,'{}'::jsonb)->>'work_area'),'');
    if location_work_area is null or not exists (
      select 1
      from public.work_areas w
      where w.site_code=new.site
        and w.code=location_work_area
        and w.active=true
    ) then
      raise exception using
        errcode='23503',
        message='INVENTORY_WORK_LOCATION_AREA_INVALID',
        detail=format('site=%s code=%s work_area=%s',new.site,new.code,coalesce(location_work_area,''));
    end if;
  end if;

  return null;
end;
$;

drop trigger if exists inventory_locations_master_parity_guard on public.inventory_locations;
create trigger inventory_locations_master_parity_guard
after insert or update of site,kind,active,metadata on public.inventory_locations
for each row execute function public.inventory_location_master_parity_guard();

-- A work-stock row and its item work area must agree at transaction commit.
-- The constraint is deferred so the existing relocate-work-area transaction can
-- move stock and then update inventory_items.work_area atomically.
create or replace function public.inventory_stock_work_area_parity_guard()
returns trigger
language plpgsql
as $$
declare
  item_area text;
  location_area text;
  location_kind text;
begin
  if not exists (
    select 1
    from public.inventory_stock s
    where s.item_id=new.item_id and s.location_id=new.location_id
  ) then
    return null;
  end if;

  select i.work_area,l.kind,nullif(btrim(l.metadata->>'work_area'),'')
    into item_area,location_kind,location_area
  from public.inventory_items i
  join public.inventory_locations l on l.id=new.location_id
  where i.id=new.item_id;

  if location_kind='work' and (location_area is null or location_area<>item_area) then
    raise exception using
      errcode='23514',
      message='INVENTORY_WORK_STOCK_AREA_MISMATCH',
      detail=format(
        'item_id=%s location_id=%s item_work_area=%s location_work_area=%s',
        new.item_id,new.location_id,coalesce(item_area,''),coalesce(location_area,'')
      );
  end if;

  return null;
end;
$$;

drop trigger if exists inventory_stock_work_area_parity_guard on public.inventory_stock;
create constraint trigger inventory_stock_work_area_parity_guard
after insert or update on public.inventory_stock
deferrable initially deferred
for each row execute function public.inventory_stock_work_area_parity_guard();

create or replace function public.inventory_item_work_stock_parity_guard()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=new.id
      and l.kind='work'
      and l.active=true
      and nullif(btrim(l.metadata->>'work_area'),'') is distinct from new.work_area
  ) then
    raise exception using
      errcode='23514',
      message='INVENTORY_ITEM_WORK_AREA_STOCK_MISMATCH',
      detail=format('item_id=%s item_key=%s work_area=%s',new.id,new.item_key,new.work_area);
  end if;
  return null;
end;
$$;

drop trigger if exists inventory_item_work_stock_parity_guard on public.inventory_items;
create constraint trigger inventory_item_work_stock_parity_guard
after insert or update on public.inventory_items
deferrable initially deferred
for each row execute function public.inventory_item_work_stock_parity_guard();

-- Final migration assertions: every active inventory work area has one active
-- work location, every active work location points to an active work area, and
-- every work-stock row matches the item's declared area.
do $verify$
begin
  if exists (
    select 1
    from public.work_areas w
    join public.sites s on s.code=w.site_code
    where w.active=true
      and s.active=true
      and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
      and not exists (
        select 1
        from public.inventory_locations l
        where l.site=w.site_code
          and l.kind='work'
          and l.active=true
          and nullif(btrim(l.metadata->>'work_area'),'')=w.code
      )
  ) then
    raise exception 'INVENTORY_WORK_AREA_LOCATION_PARITY_FAILED';
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
          and w.code=nullif(btrim(l.metadata->>'work_area'),'')
          and w.active=true
      )
  ) then
    raise exception 'INVENTORY_WORK_LOCATION_AREA_PARITY_FAILED';
  end if;

  if exists (
    select 1
    from public.inventory_stock s
    join public.inventory_items i on i.id=s.item_id
    join public.inventory_locations l on l.id=s.location_id
    where l.kind='work'
      and nullif(btrim(l.metadata->>'work_area'),'') is distinct from i.work_area
  ) then
    raise exception 'INVENTORY_WORK_STOCK_AREA_PARITY_FAILED';
  end if;

  if exists (
    select 1
    from public.inventory_locations l
    where l.active=true
      and l.kind='storage'
      and coalesce(nullif(btrim(l.metadata->>'storage_group'),''),'') not in ('primary','service')
  ) then
    raise exception 'INVENTORY_STORAGE_GROUP_PARITY_FAILED';
  end if;
end;
$verify$;

commit;
