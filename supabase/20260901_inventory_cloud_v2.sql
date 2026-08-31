-- Kitchen OS inventory cloud sync v2
-- Run once in Supabase SQL Editor after the original schema.sql.
-- Adds stable item keys, Fuxing locations, controlled stocktake adjustments,
-- and Realtime support for phone/laptop/PC synchronization.

alter table public.inventory_items
  add column if not exists item_key text,
  add column if not exists work_area text not null default 'noodles',
  add column if not exists storage_only boolean not null default false;

create unique index if not exists inventory_items_item_key_uidx
  on public.inventory_items(item_key)
  where item_key is not null;

alter table public.inventory_locations
  add column if not exists kind text not null default 'storage';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_locations_kind_check'
      and conrelid = 'public.inventory_locations'::regclass
  ) then
    alter table public.inventory_locations
      add constraint inventory_locations_kind_check
      check (kind in ('storage','work'));
  end if;
end $$;

insert into public.inventory_locations(code,name_zh_tw,name_vi,site,kind,sort_order)
values
  ('fuxing-large-freezer','大冷凍','Tủ đông lớn','fuxing','storage',10),
  ('fuxing-large-fridge','大冷藏','Tủ mát lớn','fuxing','storage',20),
  ('fuxing-four-door','四門冰箱','Tủ lạnh 4 cánh','fuxing','storage',30),
  ('fuxing-kitchen','廚房冰箱','Tủ lạnh bếp','fuxing','storage',40),
  ('fuxing-work-noodles','麵區現場','Khu mì đang dùng','fuxing','work',110),
  ('fuxing-work-soup','湯區現場','Khu canh đang dùng','fuxing','work',120),
  ('fuxing-work-seafood','海鮮區現場','Khu hải sản đang dùng','fuxing','work',130),
  ('fuxing-work-meat','肉區現場','Khu thịt đang dùng','fuxing','work',140)
on conflict (code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind=excluded.kind,
  sort_order=excluded.sort_order;

update public.inventory_locations
set kind='storage'
where code in ('central-freezer','central-four-door','central-chest','central-fridge');

-- Admin-only idempotent catalog bootstrap.
-- Existing stock quantities are NEVER overwritten; only missing stock rows are created.
create or replace function public.bootstrap_inventory_catalog(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_item jsonb;
  v_loc jsonb;
  v_item_id uuid;
  v_location_id uuid;
  v_count integer := 0;
begin
  select public.profiles.role into v_role
  from public.profiles
  where id=(select auth.uid()) and active=true;

  if v_role <> 'admin' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_CATALOG';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(trim(v_item->>'key'),'') is null then
      continue;
    end if;

    insert into public.inventory_items(
      item_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,updated_at
    )
    values(
      v_item->>'key',
      coalesce(nullif(trim(v_item->>'zh'),''), v_item->>'key'),
      coalesce(nullif(trim(v_item->>'vi'),''), coalesce(nullif(trim(v_item->>'zh'),''), v_item->>'key')),
      coalesce(nullif(trim(v_item->>'unit'),''),'個'),
      case when v_item->>'work_area' in ('noodles','soup','seafood','meat') then v_item->>'work_area' else 'noodles' end,
      coalesce((v_item->>'storage_only')::boolean,false),
      true,
      now()
    )
    on conflict (item_key) where item_key is not null
    do update set
      name_zh_tw=excluded.name_zh_tw,
      name_vi=excluded.name_vi,
      unit=excluded.unit,
      work_area=excluded.work_area,
      storage_only=excluded.storage_only,
      active=true,
      updated_at=now()
    returning id into v_item_id;

    for v_loc in select value from jsonb_array_elements(coalesce(v_item->'locations','[]'::jsonb))
    loop
      select id into v_location_id
      from public.inventory_locations
      where code=v_loc->>'code' and active=true;

      if v_location_id is null then
        continue;
      end if;

      insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
      values(
        v_item_id,
        v_location_id,
        greatest(0,coalesce((v_loc->>'quantity')::numeric,0)),
        greatest(0,coalesce((v_loc->>'minimum')::numeric,0))
      )
      on conflict (item_id,location_id) do update
      set minimum_quantity=excluded.minimum_quantity;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.bootstrap_inventory_catalog(jsonb) from public, anon;
grant execute on function public.bootstrap_inventory_catalog(jsonb) to authenticated;

-- Direct stocktake correction. Only supervisor / manager / admin may use it.
-- Every correction is written to inventory_transactions as direction='adjust'.
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
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select p.role,
         (p.location='all' or p.location=l.site)
    into v_role,v_allowed
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  where p.id=(select auth.uid()) and p.active=true;

  if v_role not in ('admin','manager','supervisor')
     or not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'DIRECT_ADJUST_NOT_ALLOWED';
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
  v_row public.inventory_stock;
begin
  select p.role,
         (p.location='all' or p.location=l.site)
    into v_role,v_allowed
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  where p.id=(select auth.uid()) and p.active=true;

  if v_role not in ('admin','manager','supervisor')
     or not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'MINIMUM_EDIT_NOT_ALLOWED';
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

-- Supervisors are management-level for inventory history.
drop policy if exists "inventory transactions management read" on public.inventory_transactions;
create policy "inventory transactions management read"
on public.inventory_transactions for select
to authenticated
using (
  (select private.current_role()) in ('admin','manager','supervisor')
  and (select private.has_permission('inventory','view'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id=inventory_transactions.location_id
      and (select private.location_allowed(l.site))
  )
);

-- Harden inventory writes: browser clients may read stock, but all mutations must go through audited RPCs.
revoke insert, update on public.inventory_stock from authenticated;
revoke insert on public.inventory_transactions from authenticated;
grant select on public.inventory_stock to authenticated;
grant select on public.inventory_transactions to authenticated;

create or replace function public.adjust_inventory(
  p_item_id uuid,
  p_location_id uuid,
  p_direction text,
  p_amount numeric,
  p_note text default ''
)
returns public.inventory_stock
language plpgsql
security definer
set search_path = ''
as $
declare
  v_allowed boolean;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select (select private.has_permission('inventory','edit'))
         and (select private.location_allowed(l.site))
    into v_allowed
  from public.inventory_locations l
  where l.id=p_location_id and l.active=true;

  if not coalesce(v_allowed,false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'INVALID_DIRECTION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  select quantity into v_before
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_location_id
  for update;

  if v_before is null then
    raise exception 'STOCK_ROW_NOT_FOUND';
  end if;

  v_after := case when p_direction='in'
    then v_before+p_amount
    else v_before-p_amount
  end;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  update public.inventory_stock
  set quantity=v_after,updated_at=now()
  where item_id=p_item_id and location_id=p_location_id
  returning * into v_row;

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id
  ) values(
    p_item_id,p_location_id,p_direction,p_amount,
    v_before,v_after,coalesce(p_note,''),(select auth.uid())
  );

  return v_row;
end;
$;

revoke all on function public.adjust_inventory(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.adjust_inventory(uuid,uuid,text,numeric,text) to authenticated;

-- Atomic stock transfer between two locations of the same site.
-- Used for reserve -> service/work-area replenishment and prevents stale-device overwrite.
create or replace function public.transfer_inventory(
  p_item_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_amount numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_source_site text;
  v_destination_site text;
  v_source_before numeric(12,2);
  v_destination_before numeric(12,2);
  v_source_after numeric(12,2);
  v_destination_after numeric(12,2);
begin
  if p_source_location_id=p_destination_location_id then
    raise exception 'SAME_LOCATION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  select site into v_source_site
  from public.inventory_locations
  where id=p_source_location_id and active=true;
  select site into v_destination_site
  from public.inventory_locations
  where id=p_destination_location_id and active=true;

  if v_source_site is null or v_destination_site is null or v_source_site<>v_destination_site then
    raise exception 'INVALID_TRANSFER_LOCATIONS';
  end if;
  if not coalesce((select private.location_allowed(v_source_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_source_location_id,0,0)
  on conflict (item_id,location_id) do nothing;
  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_destination_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  -- Lock in UUID order to keep concurrent transfers deterministic.
  perform 1
  from public.inventory_stock
  where item_id=p_item_id
    and location_id in (p_source_location_id,p_destination_location_id)
  order by location_id
  for update;

  select quantity into v_source_before
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_source_location_id;
  select quantity into v_destination_before
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_destination_location_id;

  if v_source_before < p_amount then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  v_source_after:=v_source_before-p_amount;
  v_destination_after:=v_destination_before+p_amount;

  update public.inventory_stock
  set quantity=v_source_after,updated_at=now()
  where item_id=p_item_id and location_id=p_source_location_id;

  update public.inventory_stock
  set quantity=v_destination_after,updated_at=now()
  where item_id=p_item_id and location_id=p_destination_location_id;

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id
  ) values
    (p_item_id,p_source_location_id,'out',p_amount,v_source_before,v_source_after,
     coalesce(nullif(trim(p_note),''),'轉撥出庫 / Chuyển kho ra'),(select auth.uid())),
    (p_item_id,p_destination_location_id,'in',p_amount,v_destination_before,v_destination_after,
     coalesce(nullif(trim(p_note),''),'轉撥入庫 / Chuyển kho vào'),(select auth.uid()));

  return jsonb_build_object(
    'source_before',v_source_before,
    'source_after',v_source_after,
    'destination_before',v_destination_before,
    'destination_after',v_destination_after
  );
end;
$;

revoke all on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) to authenticated;

-- Allow Realtime changes for inventory. Ignore duplicate-publication errors.
do $$
begin
  begin
    alter publication supabase_realtime add table public.inventory_stock;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inventory_transactions;
  exception when duplicate_object then null;
  end;
end $$;
