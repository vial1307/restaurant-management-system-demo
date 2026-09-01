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
