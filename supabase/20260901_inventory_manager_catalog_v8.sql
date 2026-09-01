-- Kitchen OS inventory schema v8
-- Grant central-kitchen manager accounts permission to manage raw-material catalog
-- while keeping operation history and delete/archive restricted to system admins.

begin;

-- Existing manager accounts at 央廚 receive inventory view/edit permission.
update public.profiles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{inventory}',
  '{"view":true,"edit":true}'::jsonb,
  true
)
where active = true
  and role = 'manager'
  and location = 'central';

-- Direct stocktake correction:
-- admin: any allowed site
-- manager: central kitchen only
create or replace function public.set_inventory_quantity(
  p_item_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_note text default ''
)
returns public.inventory_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select p.role,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_site='central')
     ) then
    raise exception 'DIRECT_ADJUST_NOT_ALLOWED';
  end if;

  if (v_site='fuxing' and v_item_key not like 'fuxing:%')
     or (v_site='central' and v_item_key not like 'central:%')
     or (v_site='yongji' and v_item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  select quantity into v_before
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_location_id
  for update;

  v_after := p_quantity;

  update public.inventory_stock
  set quantity=v_after,updated_at=now()
  where item_id=p_item_id and location_id=p_location_id
  returning * into v_row;

  if v_after is distinct from v_before then
    insert into public.inventory_transactions(
      item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id
    ) values(
      p_item_id,p_location_id,'adjust',abs(v_after-v_before),
      v_before,v_after,
      coalesce(nullif(trim(p_note),''),'盤點調整 / Điều chỉnh kiểm kê'),
      (select auth.uid())
    );
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_inventory_quantity(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.set_inventory_quantity(uuid,uuid,numeric,text) to authenticated;

-- Minimum/standard quantity edit:
-- admin: any allowed site
-- manager: central kitchen only
create or replace function public.set_inventory_minimum(
  p_item_id uuid,
  p_location_id uuid,
  p_minimum numeric
)
returns public.inventory_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_row public.inventory_stock;
begin
  select p.role,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_site='central')
     ) then
    raise exception 'MINIMUM_EDIT_NOT_ALLOWED';
  end if;

  if (v_site='fuxing' and v_item_key not like 'fuxing:%')
     or (v_site='central' and v_item_key not like 'central:%')
     or (v_site='yongji' and v_item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
  end if;

  if p_minimum is null or p_minimum < 0 then
    raise exception 'INVALID_MINIMUM';
  end if;

  update public.inventory_stock
  set minimum_quantity=p_minimum,updated_at=now()
  where item_id=p_item_id and location_id=p_location_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_inventory_minimum(uuid,uuid,numeric) from public, anon;
grant execute on function public.set_inventory_minimum(uuid,uuid,numeric) to authenticated;

-- Catalog add/edit:
-- admin: any allowed site
-- manager: central kitchen only
create or replace function public.sync_inventory_catalog_item(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_item_id uuid;
  v_key text;
  v_expected_site text;
  v_catalog_key text;
  v_zh text;
  v_vi text;
  v_unit text;
  v_work_area text;
  v_storage_only boolean;
  v_loc jsonb;
  v_location_id uuid;
  v_location_site text;
  v_selected_ids uuid[] := array[]::uuid[];
  v_existing record;
begin
  select p.role into v_role
  from public.profiles p
  where p.id=(select auth.uid()) and p.active=true;

  v_key:=nullif(trim(p_item->>'key'),'');
  v_expected_site:=case
    when v_key like 'fuxing:%' then 'fuxing'
    when v_key like 'central:%' then 'central'
    when v_key like 'yongji:%' then 'yongji'
    else null
  end;
  v_zh:=nullif(trim(p_item->>'zh'),'');
  v_catalog_key:=coalesce(
    nullif(trim(p_item->>'catalog_key'),''),
    lower(regexp_replace(coalesce(v_zh,v_key), '[[:space:][:punct:]]+', '', 'g'))
  );
  v_vi:=nullif(trim(p_item->>'vi'),'');
  v_unit:=nullif(trim(p_item->>'unit'),'');
  v_work_area:=coalesce(nullif(trim(p_item->>'work_area'),''),'noodles');
  v_storage_only:=coalesce((p_item->>'storage_only')::boolean,false);

  if not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_expected_site='central')
     ) then
    raise exception 'CATALOG_EDIT_NOT_ALLOWED';
  end if;

  if v_key is null or v_expected_site is null or v_zh is null or v_vi is null or v_unit is null then
    raise exception 'INVALID_CATALOG_ITEM';
  end if;
  if v_work_area not in ('noodles','soup','seafood','meat') then
    raise exception 'INVALID_WORK_AREA';
  end if;
  if jsonb_typeof(coalesce(p_item->'locations','[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_LOCATIONS';
  end if;

  select id into v_item_id
  from public.inventory_items
  where item_key=v_key
  limit 1;

  if v_item_id is null then
    insert into public.inventory_items(
      item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,updated_at
    ) values(
      v_key,v_catalog_key,v_zh,v_vi,v_unit,v_work_area,v_storage_only,true,now()
    )
    returning id into v_item_id;
  else
    update public.inventory_items
    set catalog_key=coalesce(v_catalog_key,catalog_key),
        name_zh_tw=v_zh,
        name_vi=v_vi,
        unit=v_unit,
        work_area=v_work_area,
        storage_only=v_storage_only,
        active=true,
        updated_at=now()
    where id=v_item_id;
  end if;

  for v_loc in
    select value from jsonb_array_elements(coalesce(p_item->'locations','[]'::jsonb))
  loop
    select id,site into v_location_id,v_location_site
    from public.inventory_locations
    where code=v_loc->>'code' and active=true
    limit 1;

    if v_location_id is null then
      raise exception 'LOCATION_NOT_FOUND';
    end if;
    if v_location_site<>v_expected_site then
      raise exception 'ITEM_SITE_MISMATCH';
    end if;
    if not coalesce((select private.location_allowed(v_location_site)),false) then
      raise exception 'LOCATION_NOT_ALLOWED';
    end if;

    v_selected_ids:=array_append(v_selected_ids,v_location_id);

    insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
    values(
      v_item_id,
      v_location_id,
      0,
      greatest(0,coalesce((v_loc->>'minimum')::numeric,0))
    )
    on conflict (item_id,location_id) do update
    set minimum_quantity=excluded.minimum_quantity,
        updated_at=now();
  end loop;

  for v_existing in
    select s.location_id,s.quantity,l.site
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=v_item_id
      and not (s.location_id=any(v_selected_ids))
  loop
    if not coalesce((select private.location_allowed(v_existing.site)),false) then
      continue;
    end if;
    if v_existing.quantity <> 0 then
      raise exception 'LOCATION_HAS_STOCK';
    end if;
    delete from public.inventory_stock
    where item_id=v_item_id and location_id=v_existing.location_id;
  end loop;

  return v_item_id;
end;
$$;

revoke all on function public.sync_inventory_catalog_item(jsonb) from public, anon;
grant execute on function public.sync_inventory_catalog_item(jsonb) to authenticated;

-- Frontend compatibility marker for the central-manager catalog permission contract.
create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 8;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;
