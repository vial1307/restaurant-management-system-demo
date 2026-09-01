-- =====================================================================
-- 食徒 Kitchen OS · SUPABASE MASTER · schema v11
-- Current database contract: Auth + profiles + permissions + inventory.
-- Generated 2026-09-02.
--
-- USE THIS FILE from now on for Supabase SQL setup/repair.
-- Safe intent:
--   * CREATE/ALTER missing database objects
--   * CREATE OR REPLACE functions/policies
--   * preserve existing inventory quantities and transaction rows
--   * grant manager inventory scope, including manager + location='all'
--   * NEVER DROP/TRUNCATE the inventory data tables
--
-- IMPORTANT ABOUT LOGIN:
-- Supabase Auth stores passwords in auth.users and remains the login engine.
-- SQL defines the profile/role/permission side of login.
-- Staff account create/delete/password reset is still handled by the
-- server-side Edge Function: supabase/functions/admin-users/index.ts.
-- Do not put service_role/admin secrets in browser code.
-- =====================================================================


-- ==================== BASE AUTH / PROFILE / RLS SCHEMA ====================
-- 食徒 Kitchen OS - Supabase schema
-- Run this once in Supabase SQL Editor, or convert it into a migration.
-- This schema is designed for browser access through a publishable key + Supabase Auth.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  role text not null default 'employee'
    check (role in ('admin','manager','supervisor','employee','parttime','central')),
  location text not null default 'fuxing'
    check (location in ('all','fuxing','central','yongji')),
  active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  preferred_language text not null default 'vi'
    check (preferred_language in ('vi','zh-TW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_location_idx on public.profiles(location);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name_zh_tw text not null,
  name_vi text not null,
  unit text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_zh_tw text not null,
  name_vi text not null,
  site text not null check (site in ('fuxing','central','yongji')),
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.inventory_stock (
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(12,2) not null default 0 check (minimum_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index if not exists inventory_stock_location_idx
  on public.inventory_stock(location_id);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  location_id uuid not null references public.inventory_locations(id),
  direction text not null check (direction in ('in','out','adjust')),
  amount numeric(12,2) not null check (amount > 0),
  before_quantity numeric(12,2) not null,
  after_quantity numeric(12,2) not null,
  note text not null default '',
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_created_idx
  on public.inventory_transactions(created_at desc);
create index if not exists inventory_transactions_actor_idx
  on public.inventory_transactions(actor_id);
create index if not exists inventory_transactions_location_idx
  on public.inventory_transactions(location_id);

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
  limit 1
$$;

create or replace function private.current_location()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.location
  from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
  limit 1
$$;

create or replace function private.has_permission(module_name text, action_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when p.role = 'admin' then true
      else (p.permissions -> module_name ->> action_name)::boolean
    end,
    false
  )
  from public.profiles p
  where p.id = (select auth.uid()) and p.active = true
  limit 1
$$;

create or replace function private.location_allowed(target_site text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.location = 'all' or p.location = target_site
     from public.profiles p
     where p.id = (select auth.uid()) and p.active = true
     limit 1),
    false
  )
$$;

revoke execute on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_location() to authenticated;
grant execute on function private.has_permission(text,text) to authenticated;
grant execute on function private.location_allowed(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_transactions enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.inventory_items from anon, authenticated;
revoke all on table public.inventory_locations from anon, authenticated;
revoke all on table public.inventory_stock from anon, authenticated;
revoke all on table public.inventory_transactions from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.inventory_items to authenticated;
grant select on public.inventory_locations to authenticated;
grant select, insert, update on public.inventory_stock to authenticated;
grant select, insert on public.inventory_transactions to authenticated;

drop policy if exists "profiles read own or management" on public.profiles;
create policy "profiles read own or management"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.current_role()) in ('admin','manager')
);

drop policy if exists "inventory items view" on public.inventory_items;
create policy "inventory items view"
on public.inventory_items for select
to authenticated
using ((select private.has_permission('inventory','view')));

drop policy if exists "inventory locations view" on public.inventory_locations;
create policy "inventory locations view"
on public.inventory_locations for select
to authenticated
using (
  (select private.has_permission('inventory','view'))
  and (select private.location_allowed(site))
);

drop policy if exists "inventory stock view" on public.inventory_stock;
create policy "inventory stock view"
on public.inventory_stock for select
to authenticated
using (
  (select private.has_permission('inventory','view'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_stock.location_id
      and (select private.location_allowed(l.site))
  )
);

drop policy if exists "inventory stock insert" on public.inventory_stock;
create policy "inventory stock insert"
on public.inventory_stock for insert
to authenticated
with check (
  (select private.has_permission('inventory','edit'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_stock.location_id
      and (select private.location_allowed(l.site))
  )
);

drop policy if exists "inventory stock update" on public.inventory_stock;
create policy "inventory stock update"
on public.inventory_stock for update
to authenticated
using (
  (select private.has_permission('inventory','edit'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_stock.location_id
      and (select private.location_allowed(l.site))
  )
)
with check (
  (select private.has_permission('inventory','edit'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_stock.location_id
      and (select private.location_allowed(l.site))
  )
);

drop policy if exists "inventory transactions insert" on public.inventory_transactions;
create policy "inventory transactions insert"
on public.inventory_transactions for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and (select private.has_permission('inventory','edit'))
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_transactions.location_id
      and (select private.location_allowed(l.site))
  )
);

drop policy if exists "inventory transactions management read" on public.inventory_transactions;
create policy "inventory transactions management read"
on public.inventory_transactions for select
to authenticated
using (
  (select private.current_role()) in ('admin','manager')
  and exists (
    select 1 from public.inventory_locations l
    where l.id = inventory_transactions.location_id
      and (select private.location_allowed(l.site))
  )
);

create or replace function public.adjust_inventory(
  p_item_id uuid,
  p_location_id uuid,
  p_direction text,
  p_amount numeric,
  p_note text default ''
)
returns public.inventory_stock
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  if p_direction not in ('in','out') then
    raise exception 'INVALID_DIRECTION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  insert into public.inventory_stock(item_id, location_id, quantity, minimum_quantity)
  values (p_item_id, p_location_id, 0, 0)
  on conflict (item_id, location_id) do nothing;

  select s.quantity into v_before
  from public.inventory_stock s
  where s.item_id = p_item_id and s.location_id = p_location_id
  for update;

  v_after := case when p_direction = 'in'
    then v_before + p_amount
    else v_before - p_amount
  end;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  update public.inventory_stock
  set quantity = v_after, updated_at = now()
  where item_id = p_item_id and location_id = p_location_id
  returning * into v_row;

  insert into public.inventory_transactions(
    item_id, location_id, direction, amount,
    before_quantity, after_quantity, note, actor_id
  ) values (
    p_item_id, p_location_id, p_direction, p_amount,
    v_before, v_after, coalesce(p_note,''), (select auth.uid())
  );

  return v_row;
end;
$$;

revoke all on function public.adjust_inventory(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.adjust_inventory(uuid,uuid,text,numeric,text) to authenticated;

-- Initial central-kitchen storage locations.
insert into public.inventory_locations(code,name_zh_tw,name_vi,site,sort_order)
values
  ('central-freezer','央廚冷凍','Tủ đông bếp trung tâm','central',10),
  ('central-four-door','央廚4門','Tủ 4 cánh bếp trung tâm','central',20),
  ('central-chest','央廚臥櫃','Tủ nằm bếp trung tâm','central',30),
  ('central-fridge','央廚冷藏','Tủ mát bếp trung tâm','central',40)
on conflict (code) do update set
  name_zh_tw = excluded.name_zh_tw,
  name_vi = excluded.name_vi,
  site = excluded.site,
  sort_order = excluded.sort_order;


-- ==================== INVENTORY STAGING MIGRATIONS THROUGH v10 ====================
-- 食徒 Kitchen OS · Staging inventory SQL (latest)
-- Generated from v7 -> v10 in the required execution order.
-- Purpose: Supabase PostgreSQL is the staging source of truth until the production VPS backend is launched.
-- Run AFTER supabase/schema.sql on a fresh database.
-- On an existing database, this script is intentionally idempotent/re-runnable where the component migrations allow it.



-- =====================================================================
-- supabase/20260901_inventory_ready_v7.sql
-- =====================================================================
-- Kitchen OS canonical inventory migration v7
-- Run AFTER supabase/schema.sql.
-- v7: 領貨 = take from storage for use; 出貨 = direct cross-site shipment.
-- Inventory actions are immediate and auditable; manager approval is deferred to VPS production.

-- Kitchen OS canonical inventory migration v6
-- Run AFTER supabase/schema.sql.
-- v6 staging policy: inventory mutations are immediate and auditable; no manager confirmation.
-- This file includes the v5 inventory foundation plus the v6 direct cross-site transfer RPC.

-- Kitchen OS canonical inventory migration v5
-- Run AFTER supabase/schema.sql in Supabase SQL Editor.
-- It combines inventory cloud hardening + multi-site Yongji + branch shipping/receiving.
-- Safe to re-run: DDL/RPCs are idempotent where practical.

-- Kitchen OS inventory cloud sync v2
-- Run once in Supabase SQL Editor after the original schema.sql.
-- Adds stable item keys, Fuxing locations, controlled stocktake adjustments,
-- and Realtime support for phone/laptop/PC synchronization.

alter table public.inventory_items
  add column if not exists item_key text,
  add column if not exists catalog_key text,
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
    -- Bootstrap is seed-only. Never let a stale browser overwrite cloud catalog metadata.
    do update set item_key=excluded.item_key
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
      -- Existing cloud quantity/minimum is authoritative. Bootstrap only creates missing rows.
      on conflict (item_id,location_id) do nothing;

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

  if v_role <> 'admin'
     or not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false) then
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

  if v_role <> 'admin'
     or not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false) then
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

-- Supervisors may resolve staff display names for inventory audit history.
drop policy if exists "profiles read own or management" on public.profiles;
create policy "profiles read own or management"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.current_role()) = 'admin'
);

-- Supervisors are management-level for inventory history.
drop policy if exists "inventory transactions management read" on public.inventory_transactions;
create policy "inventory transactions management read"
on public.inventory_transactions for select
to authenticated
using (
  (select private.current_role()) = 'admin'
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
as $$
declare
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select (select private.has_permission('inventory','edit'))
         and (select private.location_allowed(l.site)),
         l.site,
         i.item_key
    into v_allowed,v_site,v_item_key
  from public.inventory_locations l
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where l.id=p_location_id and l.active=true;

  if not coalesce(v_allowed,false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;
  if (v_site='fuxing' and v_item_key not like 'fuxing:%')
     or (v_site='central' and v_item_key not like 'central:%')
     or (v_site='yongji' and v_item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
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
$$;

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
as $$
declare
  v_source_site text;
  v_destination_site text;
  v_item_key text;
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
  select item_key into v_item_key
  from public.inventory_items
  where id=p_item_id and active=true;

  if v_source_site is null or v_destination_site is null or v_source_site<>v_destination_site then
    raise exception 'INVALID_TRANSFER_LOCATIONS';
  end if;
  if not coalesce((select private.location_allowed(v_source_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;
  if (v_source_site='fuxing' and v_item_key not like 'fuxing:%')
     or (v_source_site='central' and v_item_key not like 'central:%')
     or (v_source_site='yongji' and v_item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
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
$$;

revoke all on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) to authenticated;

-- Management-only catalog synchronization.
-- Quantities are never silently overwritten here; stocktake quantities must use set_inventory_quantity().
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

  if v_role <> 'admin'
     or not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'CATALOG_EDIT_NOT_ALLOWED';
  end if;

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

  -- A removed location is only safe to detach when no stock remains there.
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

create or replace function public.archive_inventory_item(p_item_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_item_id uuid;
  v_expected_site text;
  v_has_disallowed boolean;
  v_stock numeric;
begin
  select p.role into v_role
  from public.profiles p
  where p.id=(select auth.uid()) and p.active=true;

  if v_role <> 'admin'
     or not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'CATALOG_EDIT_NOT_ALLOWED';
  end if;

  v_expected_site:=case
    when p_item_key like 'fuxing:%' then 'fuxing'
    when p_item_key like 'central:%' then 'central'
    when p_item_key like 'yongji:%' then 'yongji'
    else null
  end;
  if v_expected_site is null
     or not coalesce((select private.location_allowed(v_expected_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;

  select id into v_item_id
  from public.inventory_items
  where item_key=p_item_key and active=true
  limit 1;
  if v_item_id is null then
    return false;
  end if;

  select coalesce(sum(quantity),0) into v_stock
  from public.inventory_stock
  where item_id=v_item_id;
  if v_stock <> 0 then
    raise exception 'ITEM_HAS_STOCK';
  end if;

  select exists(
    select 1
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=v_item_id
      and not (select private.location_allowed(l.site))
  ) into v_has_disallowed;

  if coalesce(v_has_disallowed,false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;

  delete from public.inventory_stock where item_id=v_item_id;
  update public.inventory_items
  set active=false,updated_at=now()
  where id=v_item_id;

  return true;
end;
$$;

revoke all on function public.archive_inventory_item(text) from public, anon;
grant execute on function public.archive_inventory_item(text) to authenticated;

-- Frontend compatibility marker. Increment when required inventory RPC contracts change.
create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 4 $$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

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


-- ===== Multi-site / branch transfer upgrade =====

-- Kitchen OS inventory transfer / multi-site sync v3
-- Run AFTER supabase/20260901_inventory_cloud_v2.sql.
-- Adds 永吉店, shared catalog keys, branch shipment dispatch/receipt,
-- cross-device Realtime and a stable API contract for future VPS migration.

-- 1) Add 永吉 as a first-class site.
alter table public.profiles drop constraint if exists profiles_location_check;
alter table public.profiles
  add constraint profiles_location_check
  check (location in ('all','fuxing','central','yongji'));

alter table public.inventory_locations drop constraint if exists inventory_locations_site_check;
alter table public.inventory_locations
  add constraint inventory_locations_site_check
  check (site in ('fuxing','central','yongji'));

insert into public.inventory_locations(code,name_zh_tw,name_vi,site,kind,sort_order)
values
  ('yongji-large-freezer','大冷凍','Tủ đông lớn','yongji','storage',10),
  ('yongji-large-fridge','大冷藏','Tủ mát lớn','yongji','storage',20),
  ('yongji-four-door','四門冰箱','Tủ lạnh 4 cánh','yongji','storage',30),
  ('yongji-kitchen','廚房冰箱','Tủ lạnh bếp','yongji','storage',40),
  ('yongji-work-noodles','麵區現場','Khu mì đang dùng','yongji','work',110),
  ('yongji-work-soup','湯區現場','Khu canh đang dùng','yongji','work',120),
  ('yongji-work-seafood','海鮮區現場','Khu hải sản đang dùng','yongji','work',130),
  ('yongji-work-meat','肉區現場','Khu thịt đang dùng','yongji','work',140)
on conflict (code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind=excluded.kind,
  sort_order=excluded.sort_order,
  active=true;

-- 2) Shared product identity between sites.
alter table public.inventory_items
  add column if not exists catalog_key text;

update public.inventory_items
set catalog_key = lower(regexp_replace(name_zh_tw, '[[:space:][:punct:]]+', '', 'g'))
where catalog_key is null or trim(catalog_key)='';

create index if not exists inventory_items_catalog_key_idx
  on public.inventory_items(catalog_key)
  where catalog_key is not null;

-- Bootstrap understands catalog_key but stays seed-only for existing cloud stock.
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
  v_catalog_key text;
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

    v_catalog_key := coalesce(
      nullif(trim(v_item->>'catalog_key'),''),
      lower(regexp_replace(coalesce(v_item->>'zh',v_item->>'key'), '[[:space:][:punct:]]+', '', 'g'))
    );

    insert into public.inventory_items(
      item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active,updated_at
    )
    values(
      v_item->>'key',
      v_catalog_key,
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
      catalog_key=coalesce(public.inventory_items.catalog_key,excluded.catalog_key),
      active=true
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
      on conflict (item_id,location_id) do nothing;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.bootstrap_inventory_catalog(jsonb) from public, anon;
grant execute on function public.bootstrap_inventory_catalog(jsonb) to authenticated;

-- 3) Link inventory audit rows to transfers/shipments.
alter table public.inventory_transactions
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

create index if not exists inventory_transactions_reference_idx
  on public.inventory_transactions(reference_id)
  where reference_id is not null;

-- 4) Cross-site shipment documents.
create table if not exists public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  from_site text not null check (from_site in ('fuxing','central','yongji')),
  to_site text not null check (to_site in ('fuxing','central','yongji')),
  transfer_type text not null default 'branch_transfer'
    check (transfer_type in ('branch_transfer','branch_return')),
  status text not null default 'dispatched'
    check (status in ('dispatched','received','cancelled')),
  note text not null default '',
  created_by uuid not null references auth.users(id),
  dispatched_by uuid not null references auth.users(id),
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz not null default now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  check (from_site <> to_site)
);

create index if not exists inventory_transfers_from_site_idx
  on public.inventory_transfers(from_site,status,created_at desc);
create index if not exists inventory_transfers_to_site_idx
  on public.inventory_transfers(to_site,status,created_at desc);

create table if not exists public.inventory_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  source_item_id uuid not null references public.inventory_items(id),
  destination_item_id uuid references public.inventory_items(id),
  source_location_id uuid not null references public.inventory_locations(id),
  destination_location_id uuid references public.inventory_locations(id),
  quantity numeric(12,2) not null check (quantity > 0),
  received_quantity numeric(12,2),
  unit text not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_transfer_lines_transfer_idx
  on public.inventory_transfer_lines(transfer_id);

alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_lines enable row level security;

revoke all on public.inventory_transfers from anon, authenticated;
revoke all on public.inventory_transfer_lines from anon, authenticated;
grant select on public.inventory_transfers to authenticated;
grant select on public.inventory_transfer_lines to authenticated;

drop policy if exists "inventory transfers visible to participants" on public.inventory_transfers;
create policy "inventory transfers visible to participants"
on public.inventory_transfers for select
to authenticated
using (
  (select private.has_permission('inventory','view'))
  and (
    (select private.location_allowed(from_site))
    or (select private.location_allowed(to_site))
  )
);

drop policy if exists "inventory transfer lines visible to participants" on public.inventory_transfer_lines;
create policy "inventory transfer lines visible to participants"
on public.inventory_transfer_lines for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_transfers t
    where t.id=inventory_transfer_lines.transfer_id
      and (select private.has_permission('inventory','view'))
      and (
        (select private.location_allowed(t.from_site))
        or (select private.location_allowed(t.to_site))
      )
  )
);

-- 5) Simple staff-facing workflow: select item/source/branch/quantity -> dispatch.
create or replace function public.dispatch_branch_shipment(
  p_item_id uuid,
  p_source_location_id uuid,
  p_to_site text,
  p_quantity numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_site text;
  v_item_key text;
  v_catalog_key text;
  v_unit text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_transfer_id uuid;
  v_transfer_no text;
begin
  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_to_site not in ('fuxing','central','yongji') then
    raise exception 'INVALID_DESTINATION_SITE';
  end if;

  select l.site,i.item_key,i.catalog_key,i.unit
    into v_from_site,v_item_key,v_catalog_key,v_unit
  from public.inventory_locations l
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where l.id=p_source_location_id and l.active=true;

  if v_from_site is null or v_catalog_key is null then
    raise exception 'INVALID_SOURCE';
  end if;
  if v_from_site=p_to_site then
    raise exception 'SAME_SITE';
  end if;
  if not (
    (v_from_site='central' and p_to_site in ('fuxing','yongji'))
    or (v_from_site in ('fuxing','yongji') and p_to_site='central')
  ) then
    raise exception 'INVALID_BRANCH_ROUTE';
  end if;
  if not coalesce((select private.location_allowed(v_from_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;
  if (v_from_site='fuxing' and v_item_key not like 'fuxing:%')
     or (v_from_site='central' and v_item_key not like 'central:%')
     or (v_from_site='yongji' and v_item_key not like 'yongji:%') then
    raise exception 'ITEM_SITE_MISMATCH';
  end if;

  select quantity into v_before
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_source_location_id
  for update;

  if v_before is null then
    raise exception 'STOCK_ROW_NOT_FOUND';
  end if;
  if v_before < p_quantity then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  v_after:=v_before-p_quantity;
  update public.inventory_stock
  set quantity=v_after,updated_at=now()
  where item_id=p_item_id and location_id=p_source_location_id;

  v_transfer_id:=gen_random_uuid();
  v_transfer_no:='TR-'||to_char(clock_timestamp(),'YYMMDD-HH24MISS')||'-'||upper(substr(replace(v_transfer_id::text,'-',''),1,5));

  insert into public.inventory_transfers(
    id,transfer_no,from_site,to_site,transfer_type,status,note,
    created_by,dispatched_by,created_at,dispatched_at
  ) values(
    v_transfer_id,v_transfer_no,v_from_site,p_to_site,
    case when p_to_site='central' then 'branch_return' else 'branch_transfer' end,
    'dispatched',coalesce(p_note,''),
    (select auth.uid()),(select auth.uid()),now(),now()
  );

  insert into public.inventory_transfer_lines(
    transfer_id,source_item_id,source_location_id,quantity,unit
  ) values(
    v_transfer_id,p_item_id,p_source_location_id,p_quantity,v_unit
  );

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,
    reference_type,reference_id
  ) values(
    p_item_id,p_source_location_id,'out',p_quantity,v_before,v_after,
    coalesce(nullif(trim(p_note),''),'分店出貨 / Xuất hàng chi nhánh'),
    (select auth.uid()),'branch_transfer',v_transfer_id
  );

  return jsonb_build_object(
    'id',v_transfer_id,
    'transfer_no',v_transfer_no,
    'status','dispatched',
    'from_site',v_from_site,
    'to_site',p_to_site,
    'before',v_before,
    'after',v_after
  );
end;
$$;

revoke all on function public.dispatch_branch_shipment(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.dispatch_branch_shipment(uuid,uuid,text,numeric,text) to authenticated;

-- 6) Receiving side: select the real destination storage location, then confirm.
create or replace function public.receive_branch_shipment(
  p_transfer_id uuid,
  p_destination_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.inventory_transfers;
  v_line public.inventory_transfer_lines;
  v_destination_site text;
  v_source_item public.inventory_items;
  v_destination_item_id uuid;
  v_destination_item_key text;
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  select * into v_transfer
  from public.inventory_transfers
  where id=p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;
  if not coalesce((select private.location_allowed(v_transfer.to_site)),false) then
    raise exception 'LOCATION_NOT_ALLOWED';
  end if;
  if v_transfer.status='received' then
    return jsonb_build_object('id',v_transfer.id,'transfer_no',v_transfer.transfer_no,'status','received','idempotent',true);
  end if;
  if v_transfer.status<>'dispatched' then
    raise exception 'INVALID_TRANSFER_STATUS';
  end if;

  select site into v_destination_site
  from public.inventory_locations
  where id=p_destination_location_id and active=true and kind='storage';

  if v_destination_site is null or v_destination_site<>v_transfer.to_site then
    raise exception 'INVALID_DESTINATION_LOCATION';
  end if;

  select * into v_line
  from public.inventory_transfer_lines
  where transfer_id=v_transfer.id
  order by created_at
  limit 1
  for update;

  if v_line.id is null then
    raise exception 'TRANSFER_LINE_NOT_FOUND';
  end if;

  select * into v_source_item
  from public.inventory_items
  where id=v_line.source_item_id and active=true;

  if v_source_item.id is null or v_source_item.catalog_key is null then
    raise exception 'SOURCE_ITEM_NOT_FOUND';
  end if;

  select i.id into v_destination_item_id
  from public.inventory_items i
  where i.active=true
    and i.catalog_key=v_source_item.catalog_key
    and i.item_key like (v_transfer.to_site||':%')
  order by i.created_at
  limit 1;

  if v_destination_item_id is null then
    v_destination_item_key:=v_transfer.to_site||':shared:'||md5(v_source_item.catalog_key);
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
    do update set active=true
    returning id into v_destination_item_id;
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(v_destination_item_id,p_destination_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  select quantity into v_before
  from public.inventory_stock
  where item_id=v_destination_item_id and location_id=p_destination_location_id
  for update;

  v_after:=coalesce(v_before,0)+v_line.quantity;

  update public.inventory_stock
  set quantity=v_after,updated_at=now()
  where item_id=v_destination_item_id and location_id=p_destination_location_id;

  update public.inventory_transfer_lines
  set destination_item_id=v_destination_item_id,
      destination_location_id=p_destination_location_id,
      received_quantity=quantity
  where id=v_line.id;

  update public.inventory_transfers
  set status='received',
      received_by=(select auth.uid()),
      received_at=now()
  where id=v_transfer.id;

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,
    reference_type,reference_id
  ) values(
    v_destination_item_id,p_destination_location_id,'in',v_line.quantity,
    coalesce(v_before,0),v_after,
    coalesce(nullif(trim(v_transfer.note),''),'分店收貨 / Nhận hàng chi nhánh'),
    (select auth.uid()),'branch_transfer',v_transfer.id
  );

  return jsonb_build_object(
    'id',v_transfer.id,
    'transfer_no',v_transfer.transfer_no,
    'status','received',
    'received_quantity',v_line.quantity,
    'before',coalesce(v_before,0),
    'after',v_after
  );
end;
$$;

revoke all on function public.receive_branch_shipment(uuid,uuid) from public, anon;
grant execute on function public.receive_branch_shipment(uuid,uuid) to authenticated;

-- 7) Admin can cancel only before receipt by explicitly restoring source stock.
create or replace function public.cancel_dispatched_shipment(p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_transfer public.inventory_transfers;
  v_line public.inventory_transfer_lines;
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  select role into v_role
  from public.profiles
  where id=(select auth.uid()) and active=true;

  if v_role<>'admin' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_transfer
  from public.inventory_transfers
  where id=p_transfer_id
  for update;

  if v_transfer.id is null then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;
  if v_transfer.status='cancelled' then
    return jsonb_build_object('id',v_transfer.id,'status','cancelled','idempotent',true);
  end if;
  if v_transfer.status<>'dispatched' then
    raise exception 'INVALID_TRANSFER_STATUS';
  end if;

  select * into v_line
  from public.inventory_transfer_lines
  where transfer_id=v_transfer.id
  order by created_at
  limit 1
  for update;

  select quantity into v_before
  from public.inventory_stock
  where item_id=v_line.source_item_id and location_id=v_line.source_location_id
  for update;

  v_after:=coalesce(v_before,0)+v_line.quantity;

  update public.inventory_stock
  set quantity=v_after,updated_at=now()
  where item_id=v_line.source_item_id and location_id=v_line.source_location_id;

  update public.inventory_transfers
  set status='cancelled',cancelled_at=now()
  where id=v_transfer.id;

  insert into public.inventory_transactions(
    item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,
    reference_type,reference_id
  ) values(
    v_line.source_item_id,v_line.source_location_id,'in',v_line.quantity,
    coalesce(v_before,0),v_after,
    '取消分店出貨 / Hủy xuất hàng chi nhánh',
    (select auth.uid()),'branch_transfer',v_transfer.id
  );

  return jsonb_build_object('id',v_transfer.id,'status','cancelled','before',coalesce(v_before,0),'after',v_after);
end;
$$;

revoke all on function public.cancel_dispatched_shipment(uuid) from public, anon;
grant execute on function public.cancel_dispatched_shipment(uuid) to authenticated;

-- 8) Realtime for stock + shipment state on every device.
do $$
begin
  begin
    alter publication supabase_realtime add table public.inventory_transfers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inventory_transfer_lines;
  exception when duplicate_object then null;
  end;
end $$;

-- v5 means frontend can rely on multi-site locations + branch shipment RPCs.
create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 5 $$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;



-- ---------------------------------------------------------------------------
-- v6 immediate transfer extension
-- ---------------------------------------------------------------------------

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



-- ---------------------------------------------------------------------------
-- v7 領貨 / 出貨 workflow extension
-- ---------------------------------------------------------------------------

-- Kitchen OS inventory workflow v7
-- Run AFTER supabase/20260901_inventory_ready_v6.sql if v6 is already installed.
-- v7 separates 領貨 (take for use) from 出貨 (cross-site shipment).
-- It also adds a virtual 央廚 使用中 location and allows immediate transfer between any two sites.

insert into public.inventory_locations(code,name_zh_tw,name_vi,site,kind,sort_order)
values ('central-work-use','使用中','Đang sử dụng','central','work',190)
on conflict (code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind=excluded.kind,
  sort_order=excluded.sort_order,
  active=true;

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
  if v_from_site not in ('central','fuxing','yongji')
     or v_to_site not in ('central','fuxing','yongji') then
    raise exception 'INVALID_SITE';
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
      work_area=excluded.work_area,
      storage_only=excluded.storage_only,
      active=true,
      updated_at=now()
    returning id into v_destination_item_id;
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(v_destination_item_id,p_destination_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  perform 1
  from public.inventory_stock
  where (item_id=p_item_id and location_id=p_source_location_id)
     or (item_id=v_destination_item_id and location_id=p_destination_location_id)
  order by location_id
  for update;

  select quantity into v_source_before
  from public.inventory_stock
  where item_id=p_item_id
    and location_id=p_source_location_id;

  select quantity into v_destination_before
  from public.inventory_stock
  where item_id=v_destination_item_id
    and location_id=p_destination_location_id;

  if v_source_before < p_quantity then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

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
    coalesce(nullif(trim(p_note),''),'出貨 / Xuất hàng'),
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
    coalesce(nullif(trim(p_note),''),'出貨 / Xuất hàng'),
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
as $$ select 7 $$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;




-- =====================================================================
-- supabase/20260901_inventory_manager_catalog_v8.sql
-- =====================================================================
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



-- =====================================================================
-- supabase/20260901_inventory_receive_defaults_v9.sql
-- =====================================================================
-- Kitchen OS inventory schema v9
-- Optional fixed receive locations for frequently used products.
-- A missing default means staff choose the destination storage for each 出貨.
-- The shipment choice itself NEVER creates a default automatically.

begin;

create table if not exists public.inventory_receive_defaults (
  id uuid primary key default gen_random_uuid(),
  site text not null check (site in ('central','fuxing','yongji')),
  catalog_key text not null,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (site,catalog_key)
);

create index if not exists inventory_receive_defaults_site_idx
  on public.inventory_receive_defaults(site);
create index if not exists inventory_receive_defaults_catalog_idx
  on public.inventory_receive_defaults(catalog_key);

alter table public.inventory_receive_defaults enable row level security;

drop policy if exists inventory_receive_defaults_read on public.inventory_receive_defaults;
create policy inventory_receive_defaults_read
on public.inventory_receive_defaults
for select
to authenticated
using (
  coalesce((select private.has_permission('inventory','view')),false)
);

-- Writes use the RPC below so site/location validation remains centralized.
revoke insert, update, delete on public.inventory_receive_defaults from anon, authenticated;
grant select on public.inventory_receive_defaults to authenticated;

create or replace function public.set_inventory_receive_default(
  p_site text,
  p_catalog_key text,
  p_location_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_location text;
  v_location_id uuid;
  v_location_site text;
  v_location_kind text;
begin
  select p.role,p.location
    into v_role,v_profile_location
  from public.profiles p
  where p.id=(select auth.uid())
    and p.active=true;

  if v_role is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  if p_site not in ('central','fuxing','yongji') then
    raise exception 'INVALID_SITE';
  end if;

  -- Admin may configure any site. A manager may configure only their own site.
  if v_role <> 'admin'
     and not (v_role='manager' and v_profile_location=p_site) then
    raise exception 'RECEIVE_DEFAULT_EDIT_NOT_ALLOWED';
  end if;

  if nullif(trim(p_catalog_key),'') is null then
    raise exception 'CATALOG_KEY_REQUIRED';
  end if;

  -- Blank/null means "not fixed": every shipment may choose the destination.
  if nullif(trim(coalesce(p_location_code,'')),'') is null then
    delete from public.inventory_receive_defaults
    where site=p_site and catalog_key=trim(p_catalog_key);
    return true;
  end if;

  select l.id,l.site,l.kind
    into v_location_id,v_location_site,v_location_kind
  from public.inventory_locations l
  where l.code=trim(p_location_code)
    and l.active=true
  limit 1;

  if v_location_id is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;
  if v_location_site<>p_site or v_location_kind<>'storage' then
    raise exception 'INVALID_RECEIVE_LOCATION';
  end if;

  insert into public.inventory_receive_defaults(
    site,catalog_key,location_id,updated_by,updated_at
  ) values(
    p_site,trim(p_catalog_key),v_location_id,(select auth.uid()),now()
  )
  on conflict (site,catalog_key) do update
  set location_id=excluded.location_id,
      updated_by=excluded.updated_by,
      updated_at=now();

  return true;
end;
$$;

revoke all on function public.set_inventory_receive_default(text,text,text) from public, anon;
grant execute on function public.set_inventory_receive_default(text,text,text) to authenticated;

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 9;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;



-- =====================================================================
-- supabase/20260901_branch_manager_inventory_v10.sql
-- =====================================================================
-- Kitchen OS inventory schema v10
-- Branch managers (復興店 / 永吉店) may add/edit their own inventory catalog,
-- storage locations, current quantities, minimums and receiving defaults.
-- Delete/archive remains admin-only.

begin;

-- Existing branch managers receive inventory view/edit permission.
update public.profiles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{inventory}',
  '{"view":true,"edit":true}'::jsonb,
  true
)
where active=true
  and role='manager'
  and location in ('fuxing','yongji');

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
  v_profile_location text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select p.role,
         p.location,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_profile_location,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_profile_location=v_site)
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

  v_after:=p_quantity;

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
  v_profile_location text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_row public.inventory_stock;
begin
  select p.role,
         p.location,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_profile_location,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_profile_location=v_site)
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

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  update public.inventory_stock
  set minimum_quantity=p_minimum,updated_at=now()
  where item_id=p_item_id and location_id=p_location_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_inventory_minimum(uuid,uuid,numeric) from public, anon;
grant execute on function public.set_inventory_minimum(uuid,uuid,numeric) to authenticated;

create or replace function public.sync_inventory_catalog_item(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_location text;
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
  select p.role,p.location into v_role,v_profile_location
  from public.profiles p
  where p.id=(select auth.uid()) and p.active=true;

  v_key:=nullif(trim(p_item->>'key'),'');
  v_expected_site:=case
    when v_key like 'fuxing:%' then 'fuxing'
    when v_key like 'central:%' then 'central'
    when v_key like 'yongji:%' then 'yongji'
    else null
  end;

  if not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and v_profile_location=v_expected_site)
     ) then
    raise exception 'CATALOG_EDIT_NOT_ALLOWED';
  end if;

  v_zh:=nullif(trim(p_item->>'zh'),'');
  v_catalog_key:=coalesce(
    nullif(trim(p_item->>'catalog_key'),''),
    lower(regexp_replace(coalesce(v_zh,v_key), '[[:space:][:punct:]]+', '', 'g'))
  );
  v_vi:=nullif(trim(p_item->>'vi'),'');
  v_unit:=nullif(trim(p_item->>'unit'),'');
  v_work_area:=coalesce(nullif(trim(p_item->>'work_area'),''),'noodles');
  v_storage_only:=coalesce((p_item->>'storage_only')::boolean,false);

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

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 10;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;



-- ==================== MANAGER SCOPE v11 ====================
-- Kitchen OS inventory schema v11
-- Managers assigned to a specific site may manage that site.
-- Managers with location='all' may manage the currently selected central/branch site.
-- Delete/archive and operation history remain admin-only.

begin;

-- Existing branch managers receive inventory view/edit permission.
update public.profiles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{inventory}',
  '{"view":true,"edit":true}'::jsonb,
  true
)
where active=true
  and role='manager'
  and location in ('central','fuxing','yongji','all');

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
  v_profile_location text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_row public.inventory_stock;
begin
  select p.role,
         p.location,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_profile_location,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and (v_profile_location=v_site or v_profile_location='all'))
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

  v_after:=p_quantity;

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
  v_profile_location text;
  v_allowed boolean;
  v_site text;
  v_item_key text;
  v_row public.inventory_stock;
begin
  select p.role,
         p.location,
         (p.location='all' or p.location=l.site),
         l.site,
         i.item_key
    into v_role,v_profile_location,v_allowed,v_site,v_item_key
  from public.profiles p
  join public.inventory_locations l on l.id=p_location_id
  join public.inventory_items i on i.id=p_item_id and i.active=true
  where p.id=(select auth.uid()) and p.active=true;

  if not coalesce(v_allowed,false)
     or not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and (v_profile_location=v_site or v_profile_location='all'))
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

  insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
  values(p_item_id,p_location_id,0,0)
  on conflict (item_id,location_id) do nothing;

  update public.inventory_stock
  set minimum_quantity=p_minimum,updated_at=now()
  where item_id=p_item_id and location_id=p_location_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.set_inventory_minimum(uuid,uuid,numeric) from public, anon;
grant execute on function public.set_inventory_minimum(uuid,uuid,numeric) to authenticated;

create or replace function public.sync_inventory_catalog_item(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_location text;
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
  select p.role,p.location into v_role,v_profile_location
  from public.profiles p
  where p.id=(select auth.uid()) and p.active=true;

  v_key:=nullif(trim(p_item->>'key'),'');
  v_expected_site:=case
    when v_key like 'fuxing:%' then 'fuxing'
    when v_key like 'central:%' then 'central'
    when v_key like 'yongji:%' then 'yongji'
    else null
  end;

  if not coalesce((select private.has_permission('inventory','edit')),false)
     or not (
       v_role='admin'
       or (v_role='manager' and (v_profile_location=v_expected_site or v_profile_location='all'))
     ) then
    raise exception 'CATALOG_EDIT_NOT_ALLOWED';
  end if;

  v_zh:=nullif(trim(p_item->>'zh'),'');
  v_catalog_key:=coalesce(
    nullif(trim(p_item->>'catalog_key'),''),
    lower(regexp_replace(coalesce(v_zh,v_key), '[[:space:][:punct:]]+', '', 'g'))
  );
  v_vi:=nullif(trim(p_item->>'vi'),'');
  v_unit:=nullif(trim(p_item->>'unit'),'');
  v_work_area:=coalesce(nullif(trim(p_item->>'work_area'),''),'noodles');
  v_storage_only:=coalesce((p_item->>'storage_only')::boolean,false);

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

-- Receiving-location defaults follow the same site scope.
create or replace function public.set_inventory_receive_default(
  p_site text,
  p_catalog_key text,
  p_location_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_location text;
  v_location_id uuid;
  v_location_site text;
  v_location_kind text;
begin
  select p.role,p.location
    into v_role,v_profile_location
  from public.profiles p
  where p.id=(select auth.uid())
    and p.active=true;

  if v_role is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  if p_site not in ('central','fuxing','yongji') then
    raise exception 'INVALID_SITE';
  end if;

  -- Admin may configure any site. A manager may configure only their own site.
  if v_role <> 'admin'
     and not (v_role='manager' and (v_profile_location=p_site or v_profile_location='all')) then
    raise exception 'RECEIVE_DEFAULT_EDIT_NOT_ALLOWED';
  end if;

  if nullif(trim(p_catalog_key),'') is null then
    raise exception 'CATALOG_KEY_REQUIRED';
  end if;

  -- Blank/null means "not fixed": every shipment may choose the destination.
  if nullif(trim(coalesce(p_location_code,'')),'') is null then
    delete from public.inventory_receive_defaults
    where site=p_site and catalog_key=trim(p_catalog_key);
    return true;
  end if;

  select l.id,l.site,l.kind
    into v_location_id,v_location_site,v_location_kind
  from public.inventory_locations l
  where l.code=trim(p_location_code)
    and l.active=true
  limit 1;

  if v_location_id is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;
  if v_location_site<>p_site or v_location_kind<>'storage' then
    raise exception 'INVALID_RECEIVE_LOCATION';
  end if;

  insert into public.inventory_receive_defaults(
    site,catalog_key,location_id,updated_by,updated_at
  ) values(
    p_site,trim(p_catalog_key),v_location_id,(select auth.uid()),now()
  )
  on conflict (site,catalog_key) do update
  set location_id=excluded.location_id,
      updated_by=excluded.updated_by,
      updated_at=now();

  return true;
end;
$$;

revoke all on function public.set_inventory_receive_default(text,text,text) from public, anon;
grant execute on function public.set_inventory_receive_default(text,text,text) to authenticated;

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 11;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;


-- ==================== OPTIONAL FIRST ADMIN BOOTSTRAP ====================
-- This block only creates/updates the profile if admin@staff.shitu.local already exists in Supabase Auth.
-- One-time bootstrap for the first Kitchen OS administrator.
-- 1) First create an Auth user in Supabase Dashboard:
--    email: admin@staff.shitu.local
--    password: choose a temporary password (minimum 6 chars)
--    mark email as confirmed / auto-confirm if the Dashboard offers the option.
-- 2) Then run this SQL in SQL Editor.

insert into public.profiles (
  id,
  username,
  display_name,
  role,
  location,
  active,
  permissions,
  preferred_language
)
select
  u.id,
  'admin',
  '系統管理員',
  'admin',
  'all',
  true,
  jsonb_build_object(
    'dashboard',    jsonb_build_object('view', true, 'edit', true),
    'inventory',    jsonb_build_object('view', true, 'edit', true),
    'procurement',  jsonb_build_object('view', true, 'edit', true),
    'reservations', jsonb_build_object('view', true, 'edit', true),
    'preparation',  jsonb_build_object('view', true, 'edit', true),
    'menu',         jsonb_build_object('view', true, 'edit', true),
    'sop',          jsonb_build_object('view', true, 'edit', true),
    'skills',       jsonb_build_object('view', true, 'edit', true),
    'attendance',   jsonb_build_object('view', true, 'edit', true),
    'schedule',     jsonb_build_object('view', true, 'edit', true),
    'reports',      jsonb_build_object('view', true, 'edit', true),
    'remote',       jsonb_build_object('view', true, 'edit', true),
    'settings',     jsonb_build_object('view', true, 'edit', true)
  ),
  'vi'
from auth.users u
where lower(u.email) = 'admin@staff.shitu.local'
on conflict (id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  role = excluded.role,
  location = excluded.location,
  active = excluded.active,
  permissions = excluded.permissions,
  preferred_language = excluded.preferred_language,
  updated_at = now();

-- Verify:
select
  p.id,
  p.username,
  p.display_name,
  p.role,
  p.location,
  p.active
from public.profiles p
where p.username = 'admin';



-- =====================================================================
-- FINAL CURRENT-STATE NORMALIZATION (v11)
-- =====================================================================

-- Managers at a specific site, or manager + location='all', receive
-- inventory view/edit. This does not change other module permissions.
update public.profiles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{inventory}',
  '{"view":true,"edit":true}'::jsonb,
  true
)
where active=true
  and role='manager'
  and location in ('central','fuxing','yongji','all');

-- Operation history remains system-admin-only.
drop policy if exists "inventory transactions management read"
  on public.inventory_transactions;
create policy "inventory transactions management read"
on public.inventory_transactions for select
to authenticated
using (
  (select private.current_role()) = 'admin'
  and exists (
    select 1
    from public.inventory_locations l
    where l.id = inventory_transactions.location_id
      and (select private.location_allowed(l.site))
  )
);

-- Canonical schema marker used by the frontend.
create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 11;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

-- Final verification. Expected schema_version = 11.
select
  public.kitchen_inventory_schema_version() as schema_version,
  (select count(*) from public.profiles) as profile_rows,
  (select count(*) from public.inventory_items where active=true) as active_inventory_items,
  (select count(*) from public.inventory_stock) as stock_rows;
