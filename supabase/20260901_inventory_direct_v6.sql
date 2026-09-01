-- Kitchen OS direct inventory transfer v6
-- Run AFTER supabase/20260901_inventory_ready_v5.sql if v5 is already installed.
-- Staging policy: inventory actions are immediate; no manager confirmation.
-- Every mutation remains auditable through actor_id / transfer metadata.

create or replace function public.direct_branch_transfer(
  p_item_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_quantity numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_from_site text;
  v_to_site text;
  v_source_item public.inventory_items;
  v_destination_item_id uuid;
  v_destination_item_key text;
  v_source_before numeric(12,2);
  v_source_after numeric(12,2);
  v_destination_before numeric(12,2);
  v_destination_after numeric(12,2);
  v_transfer_id uuid := gen_random_uuid();
  v_transfer_no text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select l.site into v_from_site
  from public.inventory_locations l
  where l.id=p_source_location_id
    and l.active=true
    and l.kind='storage';

  select l.site into v_to_site
  from public.inventory_locations l
  where l.id=p_destination_location_id
    and l.active=true
    and l.kind='storage';

  if v_from_site is null then
    raise exception 'INVALID_SOURCE_LOCATION';
  end if;
  if v_to_site is null then
    raise exception 'INVALID_DESTINATION_LOCATION';
  end if;
  if v_from_site=v_to_site then
    raise exception 'SAME_SITE';
  end if;

  if not (
    (v_from_site='central' and v_to_site in ('fuxing','yongji'))
    or (v_from_site in ('fuxing','yongji') and v_to_site='central')
  ) then
    raise exception 'INVALID_BRANCH_ROUTE';
  end if;

  if not coalesce((select private.location_allowed(v_from_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;

  select * into v_source_item
  from public.inventory_items
  where id=p_item_id
    and active=true;

  if v_source_item.id is null then
    raise exception 'SOURCE_ITEM_NOT_FOUND';
  end if;

  if v_source_item.catalog_key is null or trim(v_source_item.catalog_key)='' then
    raise exception 'CATALOG_KEY_REQUIRED';
  end if;

  if (v_from_site='fuxing' and v_source_item.item_key not like 'fuxing:%')
     or (v_from_site='central' and v_source_item.item_key not like 'central:%')
     or (v_from_site='yongji' and v_source_item.item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
  end if;

  select quantity into v_source_before
  from public.inventory_stock
  where item_id=p_item_id
    and location_id=p_source_location_id
  for update;

  if v_source_before is null then
    raise exception 'STOCK_ROW_NOT_FOUND';
  end if;
  if v_source_before < p_quantity then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  select i.id into v_destination_item_id
  from public.inventory_items i
  where i.active=true
    and i.catalog_key=v_source_item.catalog_key
    and i.item_key like (v_to_site||':%')
  order by i.created_at
  limit 1;

  if v_destination_item_id is null then
    v_destination_item_key:=v_to_site||':shared:'||md5(v_source_item.catalog_key);
    insert into public.inventory_items(
      item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,updated_at
    ) values(
      v_destination_item_key,
      v_source_item.catalog_key,
      v_source_item.name_zh_tw,
      v_source_item.name_vi,
      v_source_item.unit,
      v_source_item.work_area,
      v_source_item.storage_only,
      true,
      now()
    )
    on conflict (item_key) where item_key is not null
    do update set
      catalog_key=excluded.catalog_key,
      name_zh_tw=excluded.name_zh_tw,
      name_vi=excluded.name_vi,
      unit=excluded.unit,
      active=true,
      updated_at=now()
    returning id into v_destination_item_id;
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(v_destination_item_id,p_destination_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  select quantity into v_destination_before
  from public.inventory_stock
  where item_id=v_destination_item_id
    and location_id=p_destination_location_id
  for update;

  v_source_after:=v_source_before-p_quantity;
  v_destination_after:=coalesce(v_destination_before,0)+p_quantity;

  update public.inventory_stock
  set quantity=v_source_after,updated_at=now()
  where item_id=p_item_id and location_id=p_source_location_id;

  update public.inventory_stock
  set quantity=v_destination_after,updated_at=now()
  where item_id=v_destination_item_id and location_id=p_destination_location_id;

  v_transfer_no:='TR-'||to_char(clock_timestamp(),'YYMMDD-HH24MISS')||'-'||upper(substr(replace(v_transfer_id::text,'-',''),1,5));

  insert into public.inventory_transfers(
    id,transfer_no,from_site,to_site,transfer_type,status,note,
    created_by,dispatched_by,received_by,created_at,dispatched_at,received_at
  ) values(
    v_transfer_id,
    v_transfer_no,
    v_from_site,
    v_to_site,
    case when v_to_site='central' then 'branch_return' else 'branch_transfer' end,
    'received',
    coalesce(p_note,''),
    v_actor,
    v_actor,
    v_actor,
    now(),
    now(),
    now()
  );

  insert into public.inventory_transfer_lines(
    transfer_id,source_item_id,destination_item_id,
    source_location_id,destination_location_id,
    quantity,received_quantity,unit
  ) values(
    v_transfer_id,
    p_item_id,
    v_destination_item_id,
    p_source_location_id,
    p_destination_location_id,
    p_quantity,
    p_quantity,
    v_source_item.unit
  );

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,
    reference_type,reference_id
  ) values
  (
    p_item_id,
    p_source_location_id,
    'out',
    p_quantity,
    v_source_before,
    v_source_after,
    coalesce(nullif(trim(p_note),''),'分店直接轉撥 / Điều chuyển trực tiếp giữa cơ sở'),
    v_actor,
    'direct_branch_transfer',
    v_transfer_id
  ),
  (
    v_destination_item_id,
    p_destination_location_id,
    'in',
    p_quantity,
    coalesce(v_destination_before,0),
    v_destination_after,
    coalesce(nullif(trim(p_note),''),'分店直接轉撥 / Điều chuyển trực tiếp giữa cơ sở'),
    v_actor,
    'direct_branch_transfer',
    v_transfer_id
  );

  return jsonb_build_object(
    'id',v_transfer_id,
    'transfer_no',v_transfer_no,
    'status','received',
    'from_site',v_from_site,
    'to_site',v_to_site,
    'source_before',v_source_before,
    'source_after',v_source_after,
    'destination_before',coalesce(v_destination_before,0),
    'destination_after',v_destination_after,
    'actor_id',v_actor
  );
end;
$$;

revoke all on function public.direct_branch_transfer(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.direct_branch_transfer(uuid,uuid,uuid,numeric,text) to authenticated;

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 6 $$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;
