begin;

-- Inventory location classification must be identical for every site:
--   storage -> metadata.storage_group = primary|service
--   work    -> exactly one active work-area master row + one active work location
-- The UI must never infer these relationships from labels or source constants.

-- Preserve any active item work-area code that predates the master table.
insert into public.work_areas(
  site_code,code,department_code,name_vi,name_zh_tw,active,sort_order,metadata
)
select distinct
  split_part(i.item_key,':',1),
  btrim(i.work_area),
  null,
  btrim(i.work_area),
  btrim(i.work_area),
  true,
  900,
  '{"recovered_from":"inventory_item"}'::jsonb
from public.inventory_items i
join public.sites s
  on s.code=split_part(i.item_key,':',1)
 and s.active=true
where i.active=true
  and btrim(i.work_area)<>''
  and btrim(i.work_area) ~ '^[a-z][a-z0-9._-]{1,39}$'
on conflict (site_code,code) do nothing;

-- Normalize storage classification first. Storage locations never belong to a
-- work area; new/unknown storage defaults to service until Super Admin changes it.
update public.inventory_locations
set metadata =
      (coalesce(metadata,'{}'::jsonb) - 'work_area')
      || jsonb_build_object(
           'ui_key',coalesce(nullif(btrim(metadata->>'ui_key'),''),code),
           'storage_group',
             case
               when metadata->>'storage_group' in ('primary','service')
                 then metadata->>'storage_group'
               else 'service'
             end
         ),
    updated_at=now()
where kind='storage';

-- Normalize already-linked work locations from their work-area master rows.
update public.inventory_locations l
set name_vi=w.name_vi,
    name_zh_tw=w.name_zh_tw,
    sort_order=w.sort_order,
    active=w.active,
    metadata =
      (coalesce(l.metadata,'{}'::jsonb) - 'storage_group')
      || jsonb_build_object(
           'ui_key',w.code,
           'work_area',w.code,
           'managed_by_work_area',true
         ),
    updated_at=now()
from public.work_areas w
where l.site=w.site_code
  and l.kind='work'
  and (
    l.metadata->>'work_area'=w.code
    or l.code=w.site_code||'-work-'||w.code
  )
  and not (l.site='central' and l.code='central-work-use');

-- A canonical work-location code may not be occupied by a storage location.
do $$
begin
  if exists (
    select 1
    from public.work_areas w
    join public.inventory_locations l
      on l.code=w.site_code||'-work-'||w.code
    where w.active=true
      and l.kind<>'work'
  ) then
    raise exception 'WORK_LOCATION_CANONICAL_CODE_CONFLICT';
  end if;
end;
$$;

-- Every active work area gets one active work location. Fuxing/Yongji already
-- satisfy this in normal production data; this creates the missing Central
-- noodle/soup/seafood/meat locations and also supports future database sites.
insert into public.inventory_locations(
  code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
)
select
  w.site_code||'-work-'||w.code,
  w.name_zh_tw,
  w.name_vi,
  w.site_code,
  'work',
  w.sort_order,
  true,
  jsonb_build_object(
    'ui_key',w.code,
    'work_area',w.code,
    'managed_by_work_area',true
  )
from public.work_areas w
where w.active=true
  and not exists (
    select 1
    from public.inventory_locations l
    where l.site=w.site_code
      and l.kind='work'
      and l.active=true
      and l.metadata->>'work_area'=w.code
  )
on conflict (code) do update
set name_zh_tw=excluded.name_zh_tw,
    name_vi=excluded.name_vi,
    kind='work',
    sort_order=excluded.sort_order,
    active=true,
    metadata=(coalesce(public.inventory_locations.metadata,'{}'::jsonb) - 'storage_group')
             || excluded.metadata,
    updated_at=now();

-- Move any work stock that is sitting in a generic/wrong work location to the
-- item's declared work area. This is the deterministic Central "使用中" split,
-- and it also repairs the same mismatch if one exists in Fuxing/Yongji.
with moved as (
  select
    s.item_id,
    target.id as target_location_id,
    sum(s.quantity) as quantity,
    max(s.minimum_quantity) as minimum_quantity
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  join public.inventory_locations source on source.id=s.location_id
  join public.inventory_locations target
    on target.site=source.site
   and target.kind='work'
   and target.active=true
   and target.metadata->>'work_area'=i.work_area
  where source.kind='work'
    and source.site=split_part(i.item_key,':',1)
    and coalesce(source.metadata->>'work_area','')<>i.work_area
  group by s.item_id,target.id
)
insert into public.inventory_stock(
  item_id,location_id,quantity,minimum_quantity,updated_at
)
select item_id,target_location_id,quantity,minimum_quantity,now()
from moved
on conflict (item_id,location_id) do update
set quantity=public.inventory_stock.quantity+excluded.quantity,
    minimum_quantity=greatest(public.inventory_stock.minimum_quantity,excluded.minimum_quantity),
    updated_at=now();

delete from public.inventory_stock s
using public.inventory_items i, public.inventory_locations source
where i.id=s.item_id
  and source.id=s.location_id
  and source.kind='work'
  and source.site=split_part(i.item_key,':',1)
  and coalesce(source.metadata->>'work_area','')<>i.work_area;

-- Retire legacy/generic work locations once no active work-area master row owns
-- them. Central's old central-work-use is handled here after its stock is split.
update public.inventory_locations l
set active=false,
    metadata=coalesce(l.metadata,'{}'::jsonb)
             || jsonb_build_object('legacy_unclassified_work_location',true),
    updated_at=now()
where l.kind='work'
  and l.active=true
  and not exists (
    select 1
    from public.work_areas w
    where w.site_code=l.site
      and w.code=l.metadata->>'work_area'
      and w.active=true
  )
  and not exists (
    select 1
    from public.inventory_stock s
    where s.location_id=l.id
      and (s.quantity>0 or s.minimum_quantity>0)
  );

delete from public.inventory_stock s
using public.inventory_locations l
where l.id=s.location_id
  and l.kind='work'
  and l.active=false
  and s.quantity=0
  and s.minimum_quantity=0
  and not exists (
    select 1
    from public.work_areas w
    where w.site_code=l.site
      and w.code=l.metadata->>'work_area'
      and w.active=true
  );

-- Enforce the classification at PostgreSQL level. Labels are never used to
-- infer identity. Work-location display fields mirror their work-area master.
create or replace function public.inventory_location_classification_guard()
returns trigger
language plpgsql
as $$
declare
  area_row public.work_areas%rowtype;
  group_code text;
  area_code text;
begin
  new.metadata := coalesce(new.metadata,'{}'::jsonb);

  if new.kind='storage' then
    group_code := coalesce(nullif(btrim(new.metadata->>'storage_group'),''),'service');
    if group_code not in ('primary','service') then
      raise exception 'INVALID_STORAGE_GROUP';
    end if;
    new.metadata :=
      (new.metadata - 'work_area')
      || jsonb_build_object(
           'ui_key',coalesce(nullif(btrim(new.metadata->>'ui_key'),''),new.code),
           'storage_group',group_code
         );
    return new;
  end if;

  if new.kind<>'work' then
    raise exception 'INVALID_LOCATION_KIND';
  end if;

  area_code := nullif(btrim(new.metadata->>'work_area'),'');
  if area_code is null then
    if new.code like new.site||'-work-%' then
      area_code := substring(new.code from char_length(new.site||'-work-') + 1);
    else
      area_code := nullif(btrim(new.metadata->>'ui_key'),'');
    end if;
  end if;

  select *
  into area_row
  from public.work_areas w
  where w.site_code=new.site
    and w.code=area_code
    and (not new.active or w.active=true)
  limit 1;

  if not found then
    raise exception 'WORK_LOCATION_AREA_NOT_FOUND';
  end if;

  new.name_vi := area_row.name_vi;
  new.name_zh_tw := area_row.name_zh_tw;
  new.sort_order := area_row.sort_order;
  new.metadata :=
    (new.metadata - 'storage_group')
    || jsonb_build_object(
         'ui_key',area_row.code,
         'work_area',area_row.code,
         'managed_by_work_area',true
       );
  return new;
end;
$$;

drop trigger if exists inventory_locations_ui_metadata_defaults on public.inventory_locations;
drop trigger if exists inventory_locations_classification_guard on public.inventory_locations;
create trigger inventory_locations_classification_guard
before insert or update of code,site,kind,name_vi,name_zh_tw,sort_order,active,metadata
on public.inventory_locations
for each row execute function public.inventory_location_classification_guard();

-- Work areas own their inventory work location. Super Admin therefore only
-- needs to edit the work-area master; the corresponding work location follows.
create or replace function public.sync_work_area_inventory_location()
returns trigger
language plpgsql
as $$
declare
  location_id uuid;
  protected_rows integer;
begin
  select l.id
  into location_id
  from public.inventory_locations l
  where l.site=new.site_code
    and l.kind='work'
    and (
      l.metadata->>'work_area'=new.code
      or l.code=new.site_code||'-work-'||new.code
    )
  order by l.active desc,
           (l.code=new.site_code||'-work-'||new.code) desc,
           l.created_at
  limit 1;

  if new.active then
    if location_id is null then
      insert into public.inventory_locations(
        code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
      ) values(
        new.site_code||'-work-'||new.code,
        new.name_zh_tw,new.name_vi,new.site_code,'work',new.sort_order,true,
        jsonb_build_object(
          'ui_key',new.code,
          'work_area',new.code,
          'managed_by_work_area',true
        )
      )
      returning id into location_id;
    else
      update public.inventory_locations
      set name_zh_tw=new.name_zh_tw,
          name_vi=new.name_vi,
          kind='work',
          sort_order=new.sort_order,
          active=true,
          metadata=(coalesce(metadata,'{}'::jsonb) - 'storage_group')
                   || jsonb_build_object(
                        'ui_key',new.code,
                        'work_area',new.code,
                        'managed_by_work_area',true
                      ),
          updated_at=now()
      where id=location_id;
    end if;
  elsif location_id is not null then
    select count(*)::int
    into protected_rows
    from public.inventory_stock
    where location_id=location_id
      and (quantity>0 or minimum_quantity>0);

    if protected_rows>0 then
      raise exception 'WORK_LOCATION_HAS_PROTECTED_STOCK';
    end if;

    update public.inventory_locations
    set active=false,updated_at=now()
    where id=location_id;
  end if;

  return new;
end;
$$;

drop trigger if exists work_areas_sync_inventory_location on public.work_areas;
create trigger work_areas_sync_inventory_location
after insert or update of name_vi,name_zh_tw,sort_order,active
on public.work_areas
for each row execute function public.sync_work_area_inventory_location();

-- Final invariants. Deployment stops rather than exposing a partly classified
-- inventory structure to Website/Super Admin.
do $$
begin
  if exists (
    select 1
    from public.inventory_locations l
    where l.active=true
      and l.kind='storage'
      and (
        l.metadata->>'storage_group' not in ('primary','service')
        or coalesce(nullif(btrim(l.metadata->>'work_area'),''),'')<>''
      )
  ) then
    raise exception 'INVENTORY_STORAGE_CLASSIFICATION_INVALID';
  end if;

  if exists (
    select 1
    from public.inventory_locations l
    left join public.work_areas w
      on w.site_code=l.site
     and w.code=l.metadata->>'work_area'
     and w.active=true
    where l.active=true
      and l.kind='work'
      and (
        w.code is null
        or l.metadata->>'ui_key'<>l.metadata->>'work_area'
        or coalesce(nullif(btrim(l.metadata->>'storage_group'),''),'')<>''
      )
  ) then
    raise exception 'INVENTORY_WORK_LOCATION_CLASSIFICATION_INVALID';
  end if;

  if exists (
    select w.site_code,w.code
    from public.work_areas w
    left join public.inventory_locations l
      on l.site=w.site_code
     and l.kind='work'
     and l.active=true
     and l.metadata->>'work_area'=w.code
    where w.active=true
    group by w.site_code,w.code
    having count(l.id)<>1
  ) then
    raise exception 'WORK_AREA_LOCATION_CARDINALITY_INVALID';
  end if;

  if exists (
    select 1
    from public.inventory_stock s
    join public.inventory_items i on i.id=s.item_id
    join public.inventory_locations l on l.id=s.location_id
    where l.kind='work'
      and l.active=true
      and l.metadata->>'work_area'<>i.work_area
  ) then
    raise exception 'WORK_STOCK_AREA_MISMATCH';
  end if;
end;
$$;

commit;
