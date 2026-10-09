-- 033: DB-authoritative supplier schedules, per-item demand and procurement orders.
-- No vendor or item is seeded: supplier identity and product links must originate from approved operator data.
create table if not exists public.procurement_suppliers (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  name_zh_tw text not null,
  name_vi text not null default '',
  phone text not null default '',
  closed_weekdays smallint[] not null default '{}'::smallint[],
  closed_dates date[] not null default '{}'::date[],
  cutoff_time time without time zone not null default '12:00',
  lead_days integer not null default 1 check (lead_days between 0 and 60),
  review_days integer not null default 1 check (review_days between 1 and 30),
  active boolean not null default true,
  revision integer not null default 1,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (site_code,id),
  check (char_length(btrim(name_zh_tw)) between 1 and 120)
);
create index if not exists procurement_suppliers_site_idx
  on public.procurement_suppliers(site_code,active,name_zh_tw);

create table if not exists public.procurement_product_rules (
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  supplier_id uuid references public.procurement_suppliers(id) on delete set null,
  weekday_demand numeric(14,3) not null default 0 check (weekday_demand >= 0),
  weekend_demand numeric(14,3) not null default 0 check (weekend_demand >= 0),
  holiday_demand numeric(14,3) not null default 0 check (holiday_demand >= 0),
  safety_stock numeric(14,3) not null default 0 check (safety_stock >= 0),
  package_size numeric(14,3) not null default 1 check (package_size > 0),
  package_unit text not null default '',
  enabled boolean not null default false,
  revision integer not null default 1,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (site_code,item_id),
  foreign key (site_code,supplier_id) references public.procurement_suppliers(site_code,id)
    on update cascade on delete set null (supplier_id)
);
create index if not exists procurement_product_rules_supplier_idx
  on public.procurement_product_rules(site_code,supplier_id);

create table if not exists public.procurement_service_calendar (
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  service_date date not null,
  day_type text not null check (day_type in ('normal','holiday','closed')),
  description text not null default '',
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (site_code,service_date)
);

create table if not exists public.procurement_orders (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  supplier_id uuid not null,
  request_key uuid not null,
  order_date date not null,
  expected_arrival date not null,
  status text not null default 'submitted' check (status in ('submitted','confirmed','received','cancelled')),
  note text not null default '',
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,request_key),
  foreign key (site_code,supplier_id) references public.procurement_suppliers(site_code,id)
);
create index if not exists procurement_orders_site_date_idx
  on public.procurement_orders(site_code,created_at desc);

create table if not exists public.procurement_order_lines (
  order_id uuid not null references public.procurement_orders(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  package_count numeric(14,3) not null check (package_count > 0),
  package_size numeric(14,3) not null check (package_size > 0),
  base_quantity numeric(14,3) not null check (base_quantity > 0),
  package_unit text not null default '',
  primary key (order_id,item_id)
);
