begin;

create table if not exists public.sites (
  code text primary key,
  name_vi text not null,
  name_zh_tw text not null,
  timezone_name text not null default 'Asia/Taipei',
  currency_code text not null default 'TWD',
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9._-]{1,39}$'),
  check (currency_code ~ '^[A-Z]{3}$'),
  check (jsonb_typeof(metadata) = 'object')
);

insert into public.sites(code,name_vi,name_zh_tw,timezone_name,currency_code,active,sort_order) values
  ('central','Bếp trung tâm','央廚','Asia/Taipei','TWD',true,10),
  ('fuxing','Chi nhánh Fuxing','復興店','Asia/Taipei','TWD',true,20),
  ('yongji','Chi nhánh Yongji','永吉店','Asia/Taipei','TWD',true,30)
on conflict(code) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  timezone_name=excluded.timezone_name,
  currency_code=excluded.currency_code,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.organization_departments (
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  code text not null,
  name_vi text not null,
  name_zh_tw text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_code,code),
  check (code ~ '^[a-z][a-z0-9._-]{1,39}$')
);

insert into public.organization_departments(site_code,code,name_vi,name_zh_tw,active,sort_order) values
  ('central','kitchen','Bếp trung tâm','央廚',true,10),
  ('fuxing','inside','Nội trường','內場',true,10),
  ('fuxing','outside','Ngoại trường','外場',true,20),
  ('yongji','inside','Nội trường','內場',true,10),
  ('yongji','outside','Ngoại trường','外場',true,20)
on conflict(site_code,code) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  staff_code text not null,
  legacy_staff_id text,
  display_name text not null,
  name_vi text,
  name_zh_tw text,
  department_code text,
  employment_type text not null default 'parttime'
    check (employment_type in ('fulltime','parttime','contract','intern','other')),
  default_work_area text,
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  hire_date date,
  termination_date date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,staff_code),
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  check (staff_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  check (termination_date is null or hire_date is null or termination_date >= hire_date),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists staff_members_site_legacy_id_uidx
  on public.staff_members(site_code,legacy_staff_id)
  where legacy_staff_id is not null;
create index if not exists staff_members_site_active_idx
  on public.staff_members(site_code,active,display_name);
create index if not exists staff_members_department_idx
  on public.staff_members(site_code,department_code)
  where department_code is not null;

create table if not exists public.user_staff_bindings (
  user_id uuid primary key references public.app_users(id) on update cascade on delete cascade,
  staff_id uuid not null unique references public.staff_members(id) on update cascade on delete restrict,
  bound_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_staff_bindings_staff_idx
  on public.user_staff_bindings(staff_id);

create table if not exists public.site_settings (
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  setting_key text not null,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (site_code,setting_key),
  check (setting_key ~ '^[a-z][a-z0-9._-]{1,95}$')
);

create table if not exists public.system_settings (
  setting_key text primary key,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (setting_key ~ '^[a-z][a-z0-9._-]{1,95}$')
);

create table if not exists public.data_migration_checkpoints (
  migration_key text not null,
  site_code text references public.sites(code) on update cascade on delete restrict,
  source_revision bigint,
  status text not null default 'pending'
    check (status in ('pending','running','verified','completed','failed','rolled_back')),
  rows_read bigint not null default 0 check (rows_read >= 0),
  rows_written bigint not null default 0 check (rows_written >= 0),
  checksum text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (migration_key,site_code),
  check (migration_key ~ '^[a-z][a-z0-9._-]{1,127}$'),
  check (jsonb_typeof(details) = 'object'),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table if not exists public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  site_code text references public.sites(code) on update cascade on delete restrict,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  requested_by_user_id uuid references public.app_users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  check (job_type ~ '^[a-z][a-z0-9._-]{1,95}$'),
  check (jsonb_typeof(payload) = 'object'),
  check (result is null or jsonb_typeof(result) in ('object','array','string','number','boolean','null')),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index if not exists system_jobs_status_requested_idx
  on public.system_jobs(status,requested_at desc);
create index if not exists system_jobs_site_idx
  on public.system_jobs(site_code,requested_at desc)
  where site_code is not null;

create table if not exists public.backup_history (
  id uuid primary key default gen_random_uuid(),
  backup_key text not null unique,
  status text not null
    check (status in ('running','succeeded','failed','deleted')),
  database_name text not null,
  schema_version text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  checksum_sha256 text,
  storage_location text,
  initiated_by_user_id uuid references public.app_users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(metadata) = 'object'),
  check (completed_at is null or completed_at >= started_at)
);

create index if not exists backup_history_started_at_idx
  on public.backup_history(started_at desc);
create index if not exists backup_history_status_idx
  on public.backup_history(status,started_at desc);

-- New relational tables use sites(code). Existing closed inventory site checks are
-- intentionally preserved for compatibility in this migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='inventory_locations_site_fkey'
      and conrelid='public.inventory_locations'::regclass
  ) then
    alter table public.inventory_locations
      add constraint inventory_locations_site_fkey
      foreign key(site) references public.sites(code)
      on update cascade on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='inventory_receive_defaults_site_fkey'
      and conrelid='public.inventory_receive_defaults'::regclass
  ) then
    alter table public.inventory_receive_defaults
      add constraint inventory_receive_defaults_site_fkey
      foreign key(site) references public.sites(code)
      on update cascade on delete restrict;
  end if;
end $$;

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

drop trigger if exists organization_departments_set_updated_at on public.organization_departments;
create trigger organization_departments_set_updated_at
before update on public.organization_departments
for each row execute function public.set_updated_at();

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

drop trigger if exists user_staff_bindings_set_updated_at on public.user_staff_bindings;
create trigger user_staff_bindings_set_updated_at
before update on public.user_staff_bindings
for each row execute function public.set_updated_at();

drop trigger if exists system_jobs_set_updated_at on public.system_jobs;
create trigger system_jobs_set_updated_at
before update on public.system_jobs
for each row execute function public.set_updated_at();

commit;
