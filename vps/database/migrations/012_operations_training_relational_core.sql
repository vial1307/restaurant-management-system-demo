begin;

create table if not exists public.reservation_bookings (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  reference_code text,
  service_date date not null,
  service_period text not null check (service_period in ('lunch','dinner','other')),
  table_count integer not null default 1 check (table_count > 0),
  party_size integer check (party_size is null or party_size > 0),
  status text not null default 'reserved'
    check (status in ('reserved','seated','completed','cancelled','no_show')),
  note text not null default '',
  source text not null default 'manual'
    check (source in ('manual','phone','walk_in','import','system')),
  legacy_reservation_id text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reservation_bookings_reference_uidx
  on public.reservation_bookings(site_code,reference_code)
  where reference_code is not null;
create unique index if not exists reservation_bookings_legacy_uidx
  on public.reservation_bookings(site_code,legacy_reservation_id)
  where legacy_reservation_id is not null;
create index if not exists reservation_bookings_service_idx
  on public.reservation_bookings(site_code,service_date,service_period,status);

create table if not exists public.preparation_task_templates (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  template_code text not null,
  title_vi text not null,
  title_zh_tw text not null,
  source_type text not null default 'checklist'
    check (source_type in ('checklist','reservation','inventory','rice','procurement','manual','system')),
  default_quantity numeric(14,3) check (default_quantity is null or default_quantity >= 0),
  default_unit text,
  default_priority integer not null default 50 check (default_priority between 0 and 100),
  work_area text,
  evidence_type text not null default 'check'
    check (evidence_type in ('none','check','photo','approval')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,template_code),
  check (template_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.preparation_tasks (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  service_date date not null,
  template_id uuid references public.preparation_task_templates(id) on delete set null,
  title text not null,
  quantity numeric(14,3) check (quantity is null or quantity >= 0),
  unit text,
  priority integer not null default 50 check (priority between 0 and 100),
  work_area text,
  assignee_staff_id uuid,
  due_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','in_progress','done','cancelled')),
  source_type text not null default 'manual'
    check (source_type in ('checklist','reservation','inventory','rice','procurement','manual','system')),
  source_entity_type text,
  source_entity_id text,
  evidence jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  completed_by_user_id uuid references public.app_users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assignee_staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  check (length(btrim(title)) > 0),
  check (jsonb_typeof(evidence) = 'object'),
  check ((status='done' and completed_at is not null) or status<>'done')
);

create index if not exists preparation_tasks_site_date_status_idx
  on public.preparation_tasks(site_code,service_date,status,priority);
create index if not exists preparation_tasks_assignee_idx
  on public.preparation_tasks(assignee_staff_id,service_date desc)
  where assignee_staff_id is not null;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  name_vi text not null,
  name_zh_tw text not null,
  contact_data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supplier_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  check (jsonb_typeof(contact_data) = 'object')
);

create table if not exists public.supplier_site_rules (
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  default_lead_days integer not null default 0 check (default_lead_days >= 0),
  minimum_order_amount numeric(14,2) check (minimum_order_amount is null or minimum_order_amount >= 0),
  currency_code text not null default 'TWD' check (currency_code ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (supplier_id,site_code),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.supplier_delivery_days (
  supplier_id uuid not null,
  site_code text not null,
  weekday smallint not null check (weekday between 0 and 6),
  order_cutoff_time time,
  delivery_offset_days integer not null default 0 check (delivery_offset_days >= 0),
  active boolean not null default true,
  primary key (supplier_id,site_code,weekday),
  foreign key (supplier_id,site_code)
    references public.supplier_site_rules(supplier_id,site_code)
    on update cascade on delete cascade
);

create table if not exists public.procurement_catalog_rules (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  catalog_key text not null,
  supplier_id uuid references public.suppliers(id) on update cascade on delete restrict,
  package_size numeric(14,3) not null check (package_size > 0),
  package_unit text not null,
  base_unit text,
  demand_rule jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,catalog_key,supplier_id),
  check (jsonb_typeof(demand_rule) = 'object')
);

create index if not exists procurement_catalog_rules_site_idx
  on public.procurement_catalog_rules(site_code,active,catalog_key);

create table if not exists public.procurement_orders (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  order_date date not null,
  expected_delivery_date date,
  status text not null default 'draft'
    check (status in ('draft','submitted','confirmed','received','cancelled')),
  note text not null default '',
  created_by_user_id uuid references public.app_users(id) on delete set null,
  submitted_by_user_id uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  received_by_user_id uuid references public.app_users(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_delivery_date is null or expected_delivery_date >= order_date),
  check ((status in ('submitted','confirmed','received') and submitted_at is not null) or status in ('draft','cancelled')),
  check ((status='received' and received_at is not null) or status<>'received')
);

create index if not exists procurement_orders_site_date_idx
  on public.procurement_orders(site_code,order_date desc,status);
create index if not exists procurement_orders_supplier_idx
  on public.procurement_orders(supplier_id,order_date desc);

create table if not exists public.procurement_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.procurement_orders(id) on delete cascade,
  catalog_key text not null,
  item_name text not null,
  package_quantity numeric(14,3) not null check (package_quantity > 0),
  package_size numeric(14,3) not null check (package_size > 0),
  package_unit text not null,
  base_unit text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists procurement_order_lines_order_idx
  on public.procurement_order_lines(order_id);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  item_code text not null,
  name_vi text not null,
  name_zh_tw text not null,
  category text,
  work_area text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,item_code),
  unique (id,site_code),
  check (item_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.sop_documents (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  sop_code text not null,
  menu_item_id uuid,
  work_area text,
  name_vi text not null,
  name_zh_tw text not null,
  active boolean not null default true,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,sop_code),
  unique (id,site_code),
  foreign key (menu_item_id,site_code)
    references public.menu_items(id,site_code)
    on update cascade on delete restrict,
  check (sop_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
);

create table if not exists public.sop_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sop_documents(id) on update cascade on delete restrict,
  version_no integer not null check (version_no > 0),
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  cooking_seconds integer check (cooking_seconds is null or cooking_seconds >= 0),
  dine_in_container text,
  takeaway_container text,
  dine_in_notes text,
  takeaway_notes text,
  utensil_name text,
  utensil_capacity_cc numeric(12,2) check (utensil_capacity_cc is null or utensil_capacity_cc >= 0),
  utensil_uses numeric(12,3) check (utensil_uses is null or utensil_uses >= 0),
  plating_rules text,
  revision_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  unique (document_id,version_no),
  check (jsonb_typeof(metadata) = 'object'),
  check (
    status<>'approved'
    or (approved_at is not null and length(btrim(coalesce(approved_by_name,''))) > 0)
  )
);

create index if not exists sop_versions_document_status_idx
  on public.sop_versions(document_id,status,version_no desc);

create table if not exists public.sop_steps (
  id uuid primary key default gen_random_uuid(),
  sop_version_id uuid not null references public.sop_versions(id) on update cascade on delete cascade,
  step_no integer not null check (step_no > 0),
  instruction_vi text,
  instruction_zh_tw text,
  timer_seconds integer check (timer_seconds is null or timer_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (sop_version_id,step_no),
  check (coalesce(length(btrim(instruction_vi)),0) > 0 or coalesce(length(btrim(instruction_zh_tw)),0) > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.skill_definitions (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  skill_code text not null,
  name_vi text not null,
  name_zh_tw text not null,
  skill_type text not null default 'custom'
    check (skill_type in ('work_area','menu','external','custom')),
  work_area text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,skill_code),
  unique (id,site_code),
  check (skill_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.staff_skill_assessments (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  staff_id uuid not null,
  skill_id uuid not null,
  level text not null check (level in ('D','C','B','A')),
  evidence jsonb not null default '{}'::jsonb,
  note text not null default '',
  assessed_by_user_id uuid references public.app_users(id) on delete set null,
  assessed_by_name text not null,
  assessed_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  foreign key (skill_id,site_code)
    references public.skill_definitions(id,site_code)
    on update cascade on delete restrict,
  check (length(btrim(assessed_by_name)) > 0),
  check (jsonb_typeof(evidence) = 'object')
);

create index if not exists staff_skill_assessments_staff_idx
  on public.staff_skill_assessments(staff_id,assessed_at desc);
create index if not exists staff_skill_assessments_skill_idx
  on public.staff_skill_assessments(skill_id,assessed_at desc);

create table if not exists public.staff_sop_training (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on update cascade on delete restrict,
  sop_version_id uuid not null references public.sop_versions(id) on update cascade on delete restrict,
  status text not null default 'assigned'
    check (status in ('assigned','practicing','pending_check','passed')),
  assigned_by_user_id uuid references public.app_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  verified_by_user_id uuid references public.app_users(id) on delete set null,
  verified_by_name text,
  verified_at timestamptz,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (staff_id,sop_version_id),
  check (
    status<>'passed'
    or (verified_at is not null and length(btrim(coalesce(verified_by_name,''))) > 0)
  )
);

create index if not exists staff_sop_training_staff_status_idx
  on public.staff_sop_training(staff_id,status);

create table if not exists public.remote_job_templates (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  job_code text not null,
  name_vi text not null,
  name_zh_tw text not null,
  department_code text,
  work_area text,
  evidence_type text not null default 'check'
    check (evidence_type in ('check','photo','approval')),
  sop_document_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,job_code),
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  foreign key (sop_document_id,site_code)
    references public.sop_documents(id,site_code)
    on update cascade on delete restrict
);

create table if not exists public.remote_job_runs (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  template_id uuid not null references public.remote_job_templates(id) on update cascade on delete restrict,
  service_date date not null,
  assignee_staff_id uuid,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','approved','rejected','cancelled')),
  evidence jsonb not null default '{}'::jsonb,
  note text not null default '',
  submitted_by_user_id uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assignee_staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  check (jsonb_typeof(evidence) = 'object'),
  check ((status in ('submitted','approved','rejected') and submitted_at is not null) or status in ('pending','in_progress','cancelled')),
  check ((status='approved' and approved_at is not null and length(btrim(coalesce(approved_by_name,''))) > 0) or status<>'approved')
);

create index if not exists remote_job_runs_site_date_status_idx
  on public.remote_job_runs(site_code,service_date,status);
create index if not exists remote_job_runs_assignee_idx
  on public.remote_job_runs(assignee_staff_id,service_date desc)
  where assignee_staff_id is not null;

create or replace function public.protect_approved_sop_version()
returns trigger
language plpgsql
as $$
begin
  if old.status='approved' then
    raise exception 'approved SOP version % is immutable', old.id using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create or replace function public.protect_approved_sop_steps()
returns trigger
language plpgsql
as $$
declare
  target_version_id uuid;
  target_status text;
begin
  target_version_id := case when tg_op='DELETE' then old.sop_version_id else new.sop_version_id end;
  select status into target_status from public.sop_versions where id=target_version_id;
  if target_status='approved' then
    raise exception 'steps of approved SOP version % are immutable', target_version_id using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists sop_versions_protect_approved on public.sop_versions;
create trigger sop_versions_protect_approved
before update or delete on public.sop_versions
for each row execute function public.protect_approved_sop_version();

drop trigger if exists sop_steps_protect_approved on public.sop_steps;
create trigger sop_steps_protect_approved
before insert or update or delete on public.sop_steps
for each row execute function public.protect_approved_sop_steps();

drop trigger if exists staff_skill_assessments_immutable on public.staff_skill_assessments;
create trigger staff_skill_assessments_immutable
before update or delete on public.staff_skill_assessments
for each row execute function public.reject_immutable_history_mutation();

drop trigger if exists reservation_bookings_set_updated_at on public.reservation_bookings;
create trigger reservation_bookings_set_updated_at
before update on public.reservation_bookings
for each row execute function public.set_updated_at();

drop trigger if exists preparation_task_templates_set_updated_at on public.preparation_task_templates;
create trigger preparation_task_templates_set_updated_at
before update on public.preparation_task_templates
for each row execute function public.set_updated_at();

drop trigger if exists preparation_tasks_set_updated_at on public.preparation_tasks;
create trigger preparation_tasks_set_updated_at
before update on public.preparation_tasks
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists supplier_site_rules_set_updated_at on public.supplier_site_rules;
create trigger supplier_site_rules_set_updated_at
before update on public.supplier_site_rules
for each row execute function public.set_updated_at();

drop trigger if exists procurement_catalog_rules_set_updated_at on public.procurement_catalog_rules;
create trigger procurement_catalog_rules_set_updated_at
before update on public.procurement_catalog_rules
for each row execute function public.set_updated_at();

drop trigger if exists procurement_orders_set_updated_at on public.procurement_orders;
create trigger procurement_orders_set_updated_at
before update on public.procurement_orders
for each row execute function public.set_updated_at();

drop trigger if exists menu_items_set_updated_at on public.menu_items;
create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

drop trigger if exists sop_documents_set_updated_at on public.sop_documents;
create trigger sop_documents_set_updated_at
before update on public.sop_documents
for each row execute function public.set_updated_at();

drop trigger if exists skill_definitions_set_updated_at on public.skill_definitions;
create trigger skill_definitions_set_updated_at
before update on public.skill_definitions
for each row execute function public.set_updated_at();

drop trigger if exists staff_sop_training_set_updated_at on public.staff_sop_training;
create trigger staff_sop_training_set_updated_at
before update on public.staff_sop_training
for each row execute function public.set_updated_at();

drop trigger if exists remote_job_templates_set_updated_at on public.remote_job_templates;
create trigger remote_job_templates_set_updated_at
before update on public.remote_job_templates
for each row execute function public.set_updated_at();

drop trigger if exists remote_job_runs_set_updated_at on public.remote_job_runs;
create trigger remote_job_runs_set_updated_at
before update on public.remote_job_runs
for each row execute function public.set_updated_at();

commit;
