begin;

-- Inventory UI structure is master data. Application code must only interpret
-- these fields; future location/group/name changes are performed in PostgreSQL
-- through the master-data API/Admin Panel instead of source-code constants.

update public.sites
set metadata = coalesce(metadata,'{}'::jsonb) || case code
  when 'central' then '{"inventory_mode":"central"}'::jsonb
  else '{"inventory_mode":"branch"}'::jsonb
end,
updated_at = now()
where active=true;

-- Preserve the historical admin landing behavior (branch inventory first),
-- but keep the choice in PostgreSQL master data instead of frontend constants.
-- Future ordering changes are made through site master data without changing
-- inventory rendering logic.
update public.sites
set sort_order = case code
  when 'fuxing' then 10
  when 'yongji' then 20
  when 'central' then 30
  else sort_order
end,
updated_at = now()
where active=true;

update public.inventory_locations
set metadata = coalesce(metadata,'{}'::jsonb) || case code
  when 'central-freezer' then '{"ui_key":"央廚冷凍","storage_group":"primary"}'::jsonb
  when 'central-fridge' then '{"ui_key":"央廚冷藏","storage_group":"primary"}'::jsonb
  when 'central-four-door' then '{"ui_key":"央廚4門","storage_group":"service"}'::jsonb
  when 'central-chest' then '{"ui_key":"央廚臥櫃","storage_group":"service"}'::jsonb
  when 'central-work-use' then '{"ui_key":"use","work_area":"use"}'::jsonb

  when 'fuxing-large-freezer' then '{"ui_key":"large-freezer","storage_group":"primary"}'::jsonb
  when 'fuxing-large-fridge' then '{"ui_key":"large-fridge","storage_group":"primary"}'::jsonb
  when 'fuxing-four-door' then '{"ui_key":"four-door","storage_group":"service"}'::jsonb
  when 'fuxing-kitchen' then '{"ui_key":"kitchen","storage_group":"service"}'::jsonb
  when 'fuxing-work-noodles' then '{"ui_key":"noodles","work_area":"noodles"}'::jsonb
  when 'fuxing-work-soup' then '{"ui_key":"soup","work_area":"soup"}'::jsonb
  when 'fuxing-work-seafood' then '{"ui_key":"seafood","work_area":"seafood"}'::jsonb
  when 'fuxing-work-meat' then '{"ui_key":"meat","work_area":"meat"}'::jsonb

  when 'yongji-large-freezer' then '{"ui_key":"large-freezer","storage_group":"primary"}'::jsonb
  when 'yongji-large-fridge' then '{"ui_key":"large-fridge","storage_group":"primary"}'::jsonb
  when 'yongji-four-door' then '{"ui_key":"four-door","storage_group":"service"}'::jsonb
  when 'yongji-kitchen' then '{"ui_key":"kitchen","storage_group":"service"}'::jsonb
  when 'yongji-work-noodles' then '{"ui_key":"noodles","work_area":"noodles"}'::jsonb
  when 'yongji-work-soup' then '{"ui_key":"soup","work_area":"soup"}'::jsonb
  when 'yongji-work-seafood' then '{"ui_key":"seafood","work_area":"seafood"}'::jsonb
  when 'yongji-work-meat' then '{"ui_key":"meat","work_area":"meat"}'::jsonb
  else '{}'::jsonb
end,
updated_at = now()
where active=true;

-- Existing active locations must expose a stable UI key. The key is data, not
-- an application constant. Existing unknown/custom locations retain their
-- immutable location code as a safe initial key and can later be renamed in
-- metadata without changing source code.
update public.inventory_locations
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('ui_key',code),
    updated_at = now()
where active=true
  and coalesce(nullif(btrim(metadata->>'ui_key'),''),'')='';

-- Work locations should point to work-area master data when their association
-- can be inferred from the existing canonical code or UI key.
update public.inventory_locations l
set metadata = coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object('work_area',w.code),
    updated_at = now()
from public.work_areas w
where l.site=w.site_code
  and l.kind='work'
  and l.active=true
  and w.active=true
  and coalesce(nullif(btrim(l.metadata->>'work_area'),''),'')=''
  and (l.code=w.site_code||'-work-'||w.code or l.metadata->>'ui_key'=w.code);

-- Storage grouping also belongs to master data. Unknown/new storage locations
-- default to service storage; managers can later change the metadata through
-- Admin Panel without a deployment.
update public.inventory_locations
set metadata = coalesce(metadata,'{}'::jsonb) || '{"storage_group":"service"}'::jsonb,
    updated_at = now()
where active=true
  and kind='storage'
  and coalesce(nullif(btrim(metadata->>'storage_group'),''),'')='';

create or replace function public.inventory_location_ui_metadata_defaults()
returns trigger
language plpgsql
as $$
declare
  candidate_work_area text;
begin
  new.metadata := coalesce(new.metadata,'{}'::jsonb);

  if coalesce(nullif(btrim(new.metadata->>'ui_key'),''),'')='' then
    new.metadata := new.metadata || jsonb_build_object('ui_key',new.code);
  end if;

  if new.kind='storage'
     and coalesce(nullif(btrim(new.metadata->>'storage_group'),''),'')='' then
    new.metadata := new.metadata || '{"storage_group":"service"}'::jsonb;
  end if;

  if new.kind='work'
     and coalesce(nullif(btrim(new.metadata->>'work_area'),''),'')='' then
    candidate_work_area := null;

    if new.metadata->>'ui_key' is not null and exists (
      select 1 from public.work_areas w
      where w.site_code=new.site
        and w.code=new.metadata->>'ui_key'
        and w.active=true
    ) then
      candidate_work_area := new.metadata->>'ui_key';
    elsif new.code like new.site||'-work-%' then
      candidate_work_area := substring(new.code from char_length(new.site||'-work-') + 1);
      if not exists (
        select 1 from public.work_areas w
        where w.site_code=new.site
          and w.code=candidate_work_area
          and w.active=true
      ) then
        candidate_work_area := null;
      end if;
    end if;

    if candidate_work_area is not null then
      new.metadata := new.metadata || jsonb_build_object(
        'work_area',candidate_work_area,
        'ui_key',candidate_work_area
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_locations_ui_metadata_defaults on public.inventory_locations;
create trigger inventory_locations_ui_metadata_defaults
before insert or update of code,site,kind,metadata on public.inventory_locations
for each row execute function public.inventory_location_ui_metadata_defaults();

create unique index if not exists inventory_locations_active_ui_key_uidx
  on public.inventory_locations(site,kind,(metadata->>'ui_key'))
  where active=true and coalesce(nullif(btrim(metadata->>'ui_key'),''),'')<>'';

create unique index if not exists inventory_locations_active_work_area_uidx
  on public.inventory_locations(site,(metadata->>'work_area'))
  where active=true and kind='work'
    and coalesce(nullif(btrim(metadata->>'work_area'),''),'')<>'';

commit;
