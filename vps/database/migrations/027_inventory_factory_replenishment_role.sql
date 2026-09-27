begin;

-- Inventory storage roles are database master data.
-- Existing branch "large-freezer" locations are backfilled to preserve the
-- current factory-replenishment behavior, but runtime code must never depend
-- on that legacy ui_key after this migration.
update public.inventory_locations l
set metadata =
  coalesce(l.metadata,'{}'::jsonb)
  || jsonb_build_object(
       'factory_replenishment',
       case
         when l.kind='storage'
          and coalesce(l.metadata->>'ui_key','')='large-freezer'
          and exists (
            select 1
            from public.sites s
            where s.code=l.site
              and coalesce(s.metadata->>'inventory_mode','')='branch'
          )
         then true
         else false
       end
     ),
    updated_at=now()
where l.kind='storage';

update public.inventory_locations
set metadata=coalesce(metadata,'{}'::jsonb)-'factory_replenishment',
    updated_at=now()
where kind='work'
  and coalesce(metadata,'{}'::jsonb) ? 'factory_replenishment';

create or replace function public.inventory_location_classification_guard()
returns trigger
language plpgsql
as $classification_guard$
declare
  area_row public.work_areas%rowtype;
  group_code text;
  area_code text;
  factory_flag text;
begin
  new.metadata := coalesce(new.metadata,'{}'::jsonb);

  if tg_op='UPDATE'
     and old.kind='work'
     and coalesce(old.metadata->>'managed_by_work_area','false')='true' then
    if new.kind<>'work' then
      raise exception 'WORK_LOCATION_KIND_MANAGED_BY_WORK_AREA';
    end if;
    if coalesce(new.metadata->>'work_area','')<>coalesce(old.metadata->>'work_area','') then
      raise exception 'WORK_LOCATION_AREA_MANAGED_BY_WORK_AREA';
    end if;
  end if;

  if new.kind='storage' then
    group_code := coalesce(nullif(btrim(new.metadata->>'storage_group'),''),'service');
    if group_code not in ('primary','service') then
      raise exception 'INVALID_STORAGE_GROUP';
    end if;

    factory_flag := lower(coalesce(nullif(btrim(new.metadata->>'factory_replenishment'),''),'false'));
    if factory_flag not in ('true','false') then
      raise exception 'INVALID_FACTORY_REPLENISHMENT_FLAG';
    end if;
    if factory_flag='true' and group_code<>'primary' then
      raise exception 'FACTORY_REPLENISHMENT_REQUIRES_PRIMARY';
    end if;

    new.metadata :=
      (new.metadata - 'work_area')
      || jsonb_build_object(
           'ui_key',coalesce(nullif(btrim(new.metadata->>'ui_key'),''),new.code),
           'storage_group',group_code,
           'factory_replenishment',(factory_flag='true')
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

  if new.active<>area_row.active then
    raise exception 'WORK_LOCATION_ACTIVE_MANAGED_BY_WORK_AREA';
  end if;

  new.name_vi := area_row.name_vi;
  new.name_zh_tw := area_row.name_zh_tw;
  new.sort_order := area_row.sort_order;
  new.metadata :=
    (new.metadata - 'storage_group' - 'factory_replenishment')
    || jsonb_build_object(
         'ui_key',area_row.code,
         'work_area',area_row.code,
         'managed_by_work_area',true
       );
  return new;
end;
$classification_guard$;

do $factory_role_verify$
begin
  if exists (
    select 1
    from public.inventory_locations l
    where l.kind='storage'
      and (
        coalesce(l.metadata->>'factory_replenishment','') not in ('true','false')
        or (
          l.metadata->>'factory_replenishment'='true'
          and l.metadata->>'storage_group'<>'primary'
        )
      )
  ) then
    raise exception 'INVENTORY_FACTORY_REPLENISHMENT_CLASSIFICATION_INVALID';
  end if;

  if exists (
    select 1
    from public.inventory_locations l
    where l.kind='work'
      and coalesce(l.metadata,'{}'::jsonb) ? 'factory_replenishment'
  ) then
    raise exception 'WORK_LOCATION_FACTORY_REPLENISHMENT_METADATA_INVALID';
  end if;
end;
$factory_role_verify$;

commit;
