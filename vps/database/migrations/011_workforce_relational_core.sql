begin;

create table if not exists public.workforce_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  staff_id uuid not null,
  schedule_kind text not null check (schedule_kind in ('date','recurring')),
  service_date date,
  recurrence_month date,
  weekday smallint,
  slot_no smallint not null default 1 check (slot_no > 0),
  shift_type text not null default 'custom'
    check (shift_type in ('morning','evening','full_day','custom')),
  start_time time not null,
  end_time time not null,
  ends_next_day boolean not null default false,
  department_code text,
  work_area text,
  legacy_schedule_id text,
  active boolean not null default true,
  source text not null default 'manager'
    check (source in ('manager','migration','system')),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  check (start_time <> end_time),
  check (
    (schedule_kind='date' and service_date is not null and recurrence_month is null and weekday is null)
    or
    (schedule_kind='recurring' and service_date is null and recurrence_month is not null and weekday between 0 and 6)
  ),
  check (recurrence_month is null or extract(day from recurrence_month)=1)
);

create unique index if not exists workforce_schedule_date_slot_uidx
  on public.workforce_schedule_entries(site_code,staff_id,service_date,slot_no)
  where schedule_kind='date' and active=true;
create unique index if not exists workforce_schedule_recurring_slot_uidx
  on public.workforce_schedule_entries(site_code,staff_id,recurrence_month,weekday,slot_no)
  where schedule_kind='recurring' and active=true;
create unique index if not exists workforce_schedule_legacy_uidx
  on public.workforce_schedule_entries(site_code,legacy_schedule_id)
  where legacy_schedule_id is not null;
create index if not exists workforce_schedule_site_date_idx
  on public.workforce_schedule_entries(site_code,service_date,active)
  where schedule_kind='date';
create index if not exists workforce_schedule_staff_idx
  on public.workforce_schedule_entries(staff_id,active);

create table if not exists public.workforce_schedule_publications (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  version integer not null check (version > 0),
  source_module_revision bigint,
  schedule_count integer not null default 0 check (schedule_count >= 0),
  published_by_user_id uuid references public.app_users(id) on delete set null,
  published_by_name text not null,
  published_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (site_code,version),
  check (length(btrim(published_by_name)) > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists workforce_schedule_publications_site_time_idx
  on public.workforce_schedule_publications(site_code,published_at desc);

create table if not exists public.workforce_schedule_publication_entries (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.workforce_schedule_publications(id) on delete restrict,
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  source_schedule_entry_id uuid references public.workforce_schedule_entries(id) on delete set null,
  staff_id uuid not null,
  schedule_kind text not null check (schedule_kind in ('date','recurring')),
  service_date date,
  recurrence_month date,
  weekday smallint,
  slot_no smallint not null default 1 check (slot_no > 0),
  shift_type text not null check (shift_type in ('morning','evening','full_day','custom')),
  start_time time not null,
  end_time time not null,
  ends_next_day boolean not null default false,
  department_code text,
  work_area text,
  legacy_schedule_id text,
  created_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  check (start_time <> end_time),
  check (
    (schedule_kind='date' and service_date is not null and recurrence_month is null and weekday is null)
    or
    (schedule_kind='recurring' and service_date is null and recurrence_month is not null and weekday between 0 and 6)
  ),
  check (recurrence_month is null or extract(day from recurrence_month)=1)
);

create index if not exists workforce_publication_entries_publication_idx
  on public.workforce_schedule_publication_entries(publication_id);
create index if not exists workforce_publication_entries_staff_idx
  on public.workforce_schedule_publication_entries(staff_id,publication_id);
create index if not exists workforce_publication_entries_date_idx
  on public.workforce_schedule_publication_entries(site_code,service_date)
  where schedule_kind='date';

create table if not exists public.workforce_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  staff_id uuid not null,
  request_type text not null check (request_type in ('leave','change')),
  service_date date not null,
  source_schedule_entry_id uuid references public.workforce_schedule_entries(id) on delete set null,
  source_snapshot jsonb,
  requested_start_time time,
  requested_end_time time,
  requested_ends_next_day boolean not null default false,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  decided_by_user_id uuid references public.app_users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  cancelled_by_user_id uuid references public.app_users(id) on delete set null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  check (length(btrim(reason)) > 0),
  check (length(btrim(created_by_name)) > 0),
  check (source_snapshot is null or jsonb_typeof(source_snapshot) = 'object'),
  check (
    request_type='leave'
    or (requested_start_time is not null and requested_end_time is not null and requested_start_time <> requested_end_time)
  ),
  check (
    (status='pending' and decided_at is null and cancelled_at is null)
    or (status in ('approved','rejected') and decided_at is not null)
    or (status='cancelled' and cancelled_at is not null)
  )
);

create unique index if not exists workforce_schedule_requests_pending_staff_date_uidx
  on public.workforce_schedule_requests(staff_id,service_date)
  where status='pending';
create index if not exists workforce_schedule_requests_site_status_idx
  on public.workforce_schedule_requests(site_code,status,created_at desc);
create index if not exists workforce_schedule_requests_staff_idx
  on public.workforce_schedule_requests(staff_id,created_at desc);

create table if not exists public.workforce_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  request_id uuid not null unique references public.workforce_schedule_requests(id) on delete restrict,
  staff_id uuid not null,
  service_date date not null,
  exception_kind text not null check (exception_kind in ('leave','override')),
  source_schedule_entry_id uuid references public.workforce_schedule_entries(id) on delete set null,
  start_time time,
  end_time time,
  ends_next_day boolean not null default false,
  department_code text,
  work_area text,
  status text not null default 'active' check (status in ('active','revoked')),
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_by_name text not null,
  approved_at timestamptz not null default now(),
  revoked_by_user_id uuid references public.app_users(id) on delete set null,
  revoked_by_name text,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  check (length(btrim(approved_by_name)) > 0),
  check (
    (exception_kind='leave' and start_time is null and end_time is null)
    or
    (exception_kind='override' and start_time is not null and end_time is not null and start_time <> end_time)
  ),
  check (
    (status='active' and revoked_at is null)
    or (status='revoked' and revoked_at is not null and length(btrim(coalesce(revoke_reason,''))) > 0)
  )
);

create unique index if not exists workforce_schedule_exceptions_active_staff_date_uidx
  on public.workforce_schedule_exceptions(staff_id,service_date)
  where status='active';
create index if not exists workforce_schedule_exceptions_site_date_idx
  on public.workforce_schedule_exceptions(site_code,service_date,status);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  staff_id uuid not null,
  legacy_attendance_id text,
  service_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  scheduled_start_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  work_area text,
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  currency_code text not null default 'TWD' check (currency_code ~ '^[A-Z]{3}$'),
  note text not null default '',
  source text not null default 'self_service'
    check (source in ('self_service','manager','migration','system')),
  source_schedule_entry_id uuid references public.workforce_schedule_entries(id) on delete set null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved')),
  approved_at timestamptz,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approved_by_name text,
  record_status text not null default 'active'
    check (record_status in ('active','voided')),
  version bigint not null default 1 check (version > 0),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_id,site_code)
    references public.staff_members(id,site_code)
    on update cascade on delete restrict,
  check (clock_out_at is null or clock_out_at >= clock_in_at),
  check (
    (approval_status='pending' and approved_at is null)
    or
    (approval_status='approved' and clock_out_at is not null and approved_at is not null and length(btrim(coalesce(approved_by_name,''))) > 0)
  )
);

create unique index if not exists attendance_records_site_legacy_uidx
  on public.attendance_records(site_code,legacy_attendance_id)
  where legacy_attendance_id is not null;
create unique index if not exists attendance_records_one_open_per_staff_uidx
  on public.attendance_records(staff_id)
  where clock_out_at is null and record_status='active';
create index if not exists attendance_records_site_date_idx
  on public.attendance_records(site_code,service_date,record_status);
create index if not exists attendance_records_staff_date_idx
  on public.attendance_records(staff_id,service_date desc);
create index if not exists attendance_records_approval_idx
  on public.attendance_records(site_code,approval_status,service_date)
  where record_status='active';

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance_records(id) on delete restrict,
  reason text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  corrected_by_user_id uuid references public.app_users(id) on delete set null,
  corrected_by_name text not null,
  corrected_at timestamptz not null default now(),
  check (length(btrim(reason)) > 0),
  check (length(btrim(corrected_by_name)) > 0),
  check (jsonb_typeof(before_data) = 'object'),
  check (jsonb_typeof(after_data) = 'object')
);

create index if not exists attendance_corrections_attendance_idx
  on public.attendance_corrections(attendance_id,corrected_at desc);

create table if not exists public.payroll_policies (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  effective_from date not null,
  effective_to date,
  late_penalty_enabled boolean not null default false,
  late_grace_minutes integer not null default 0 check (late_grace_minutes >= 0),
  late_penalty_mode text not null default 'none'
    check (late_penalty_mode in ('none','fixed','per_minute')),
  late_penalty_amount numeric(12,2) not null default 0 check (late_penalty_amount >= 0),
  currency_code text not null default 'TWD' check (currency_code ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,effective_from),
  check (effective_to is null or effective_to >= effective_from),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists payroll_policies_site_effective_idx
  on public.payroll_policies(site_code,effective_from desc,active);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  payroll_month date not null,
  status text not null default 'open' check (status in ('open','locked')),
  policy_snapshot jsonb,
  current_snapshot_revision integer not null default 0 check (current_snapshot_revision >= 0),
  locked_at timestamptz,
  locked_by_user_id uuid references public.app_users(id) on delete set null,
  locked_by_name text,
  reopened_at timestamptz,
  reopened_by_user_id uuid references public.app_users(id) on delete set null,
  reopened_by_name text,
  reopen_reason text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_code,payroll_month),
  check (extract(day from payroll_month)=1),
  check (policy_snapshot is null or jsonb_typeof(policy_snapshot) = 'object'),
  check (
    status='open'
    or (status='locked' and locked_at is not null and length(btrim(coalesce(locked_by_name,''))) > 0)
  ),
  check (reopened_at is null or length(btrim(coalesce(reopen_reason,''))) > 0)
);

create index if not exists payroll_periods_site_month_idx
  on public.payroll_periods(site_code,payroll_month desc);

create table if not exists public.payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  revision integer not null check (revision > 0),
  formula_version integer not null default 1 check (formula_version > 0),
  currency_code text not null default 'TWD' check (currency_code ~ '^[A-Z]{3}$'),
  locked_at timestamptz not null,
  locked_by_user_id uuid references public.app_users(id) on delete set null,
  locked_by_name text not null,
  policy_snapshot jsonb not null,
  approved_attendance_ids uuid[] not null default '{}'::uuid[],
  attendance_facts jsonb not null default '[]'::jsonb,
  staff_totals jsonb not null default '[]'::jsonb,
  period_totals jsonb not null default '{}'::jsonb,
  reopen_metadata jsonb,
  created_at timestamptz not null default now(),
  unique (payroll_period_id,revision),
  check (length(btrim(locked_by_name)) > 0),
  check (jsonb_typeof(policy_snapshot) = 'object'),
  check (jsonb_typeof(attendance_facts) = 'array'),
  check (jsonb_typeof(staff_totals) = 'array'),
  check (jsonb_typeof(period_totals) = 'object'),
  check (reopen_metadata is null or jsonb_typeof(reopen_metadata) = 'object')
);

create index if not exists payroll_snapshots_period_revision_idx
  on public.payroll_snapshots(payroll_period_id,revision desc);

create or replace function public.reject_immutable_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable history table % does not allow %', tg_table_name, tg_op
    using errcode = '55000';
end;
$$;

drop trigger if exists workforce_schedule_publications_immutable on public.workforce_schedule_publications;
create trigger workforce_schedule_publications_immutable
before update or delete on public.workforce_schedule_publications
for each row execute function public.reject_immutable_history_mutation();

drop trigger if exists workforce_schedule_publication_entries_immutable on public.workforce_schedule_publication_entries;
create trigger workforce_schedule_publication_entries_immutable
before update or delete on public.workforce_schedule_publication_entries
for each row execute function public.reject_immutable_history_mutation();

drop trigger if exists attendance_corrections_immutable on public.attendance_corrections;
create trigger attendance_corrections_immutable
before update or delete on public.attendance_corrections
for each row execute function public.reject_immutable_history_mutation();

drop trigger if exists payroll_snapshots_immutable on public.payroll_snapshots;
create trigger payroll_snapshots_immutable
before update or delete on public.payroll_snapshots
for each row execute function public.reject_immutable_history_mutation();

drop trigger if exists workforce_schedule_entries_set_updated_at on public.workforce_schedule_entries;
create trigger workforce_schedule_entries_set_updated_at
before update on public.workforce_schedule_entries
for each row execute function public.set_updated_at();

drop trigger if exists workforce_schedule_requests_set_updated_at on public.workforce_schedule_requests;
create trigger workforce_schedule_requests_set_updated_at
before update on public.workforce_schedule_requests
for each row execute function public.set_updated_at();

drop trigger if exists workforce_schedule_exceptions_set_updated_at on public.workforce_schedule_exceptions;
create trigger workforce_schedule_exceptions_set_updated_at
before update on public.workforce_schedule_exceptions
for each row execute function public.set_updated_at();

drop trigger if exists attendance_records_set_updated_at on public.attendance_records;
create trigger attendance_records_set_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

drop trigger if exists payroll_policies_set_updated_at on public.payroll_policies;
create trigger payroll_policies_set_updated_at
before update on public.payroll_policies
for each row execute function public.set_updated_at();

drop trigger if exists payroll_periods_set_updated_at on public.payroll_periods;
create trigger payroll_periods_set_updated_at
before update on public.payroll_periods
for each row execute function public.set_updated_at();

commit;
