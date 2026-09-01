begin;

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text,
  role text not null check (role in ('admin','manager','employee')),
  location text not null check (location in ('all','central','fuxing','yongji')),
  permissions jsonb not null default '{}'::jsonb,
  preferred_language text not null default 'vi',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_zh_tw text not null,
  name_vi text not null,
  site text not null check (site in ('central','fuxing','yongji')),
  kind text not null check (kind in ('storage','work')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  catalog_key text not null,
  name_zh_tw text not null,
  name_vi text not null,
  unit text not null,
  work_area text not null default 'noodles',
  storage_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_catalog_key_idx
  on public.inventory_items(catalog_key);

create table if not exists public.inventory_stock (
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, location_id)
);

create index if not exists inventory_stock_location_idx
  on public.inventory_stock(location_id);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  source_location_id uuid references public.inventory_locations(id),
  destination_location_id uuid references public.inventory_locations(id),
  action text not null check (action in ('in','out','use','transfer','adjust','ship','receive','return')),
  amount numeric(14,3) not null check (amount > 0),
  note text not null default '',
  actor_user_id uuid references public.app_users(id),
  actor_username text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_created_at_idx
  on public.inventory_transactions(created_at desc);
create index if not exists inventory_transactions_item_idx
  on public.inventory_transactions(item_id);
create index if not exists inventory_transactions_actor_idx
  on public.inventory_transactions(actor_user_id);

create table if not exists public.inventory_receive_defaults (
  site text not null check (site in ('central','fuxing','yongji')),
  catalog_key text not null,
  location_id uuid not null references public.inventory_locations(id),
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (site, catalog_key)
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid references public.app_users(id),
  actor_username text,
  action text not null,
  entity_type text not null,
  entity_id text,
  site text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs(actor_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists inventory_locations_set_updated_at on public.inventory_locations;
create trigger inventory_locations_set_updated_at
before update on public.inventory_locations
for each row execute function public.set_updated_at();

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

commit;
