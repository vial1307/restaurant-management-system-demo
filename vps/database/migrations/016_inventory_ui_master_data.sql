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

-- Existing and future active locations used by the inventory UI must expose a
-- stable ui_key. New rows can use their immutable location code as the key until
-- an administrator assigns a friendlier UI key.
update public.inventory_locations
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('ui_key',code),
    updated_at = now()
where active=true
  and coalesce(nullif(btrim(metadata->>'ui_key'),''),'')='';

-- Work locations should point to work-area master data when their metadata can
-- be inferred from the existing canonical code.
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

create unique index if not exists inventory_locations_active_ui_key_uidx
  on public.inventory_locations(site,kind,(metadata->>'ui_key'))
  where active=true and coalesce(nullif(btrim(metadata->>'ui_key'),''),'')<>'';

create unique index if not exists inventory_locations_active_work_area_uidx
  on public.inventory_locations(site,(metadata->>'work_area'))
  where active=true and kind='work'
    and coalesce(nullif(btrim(metadata->>'work_area'),''),'')<>'';

commit;