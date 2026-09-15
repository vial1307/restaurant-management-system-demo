begin;

-- Database Core v2 hardening. This migration is additive: do not rewrite 010-012.
-- The goal is to move critical invariants from application convention into PostgreSQL.

-- Composite identities used by foreign keys below. The primary UUID remains the
-- entity identity; these additional unique keys let PostgreSQL prove site/staff
-- ownership for references that would otherwise only validate the UUID.
alter table public.workforce_schedule_entries
  add constraint workforce_schedule_entries_id_site_staff_key unique (id,site_code,staff_id);

alter table public.workforce_schedule_publications
  add constraint workforce_schedule_publications_id_site_key unique (id,site_code);

alter table public.workforce_schedule_requests
  add constraint workforce_schedule_requests_id_site_staff_date_key
  unique (id,site_code,staff_id,service_date);

alter table public.preparation_task_templates
  add constraint preparation_task_templates_id_site_key unique (id,site_code);

alter table public.remote_job_templates
  add constraint remote_job_templates_id_site_key unique (id,site_code);

-- A publication entry must belong to the same site as its publication.
alter table public.workforce_schedule_publication_entries
  add constraint workforce_publication_entries_publication_site_fkey
  foreign key (publication_id,site_code)
  references public.workforce_schedule_publications(id,site_code)
  on update cascade on delete restrict;

-- When a snapshot points back to a mutable schedule row, it must point to the
-- same site and same employee. A NULL source id remains valid for migrated data.
alter table public.workforce_schedule_publication_entries
  add constraint workforce_publication_entries_source_schedule_scope_fkey
  foreign key (source_schedule_entry_id,site_code,staff_id)
  references public.workforce_schedule_entries(id,site_code,staff_id)
  on update cascade on delete set null (source_schedule_entry_id);

alter table public.workforce_schedule_requests
  add constraint workforce_schedule_requests_source_schedule_scope_fkey
  foreign key (source_schedule_entry_id,site_code,staff_id)
  references public.workforce_schedule_entries(id,site_code,staff_id)
  on update cascade on delete set null (source_schedule_entry_id);

-- An approved exception is a materialized consequence of exactly the same
-- request scope: request, site, employee and service date cannot drift apart.
alter table public.workforce_schedule_exceptions
  add constraint workforce_schedule_exceptions_request_scope_fkey
  foreign key (request_id,site_code,staff_id,service_date)
  references public.workforce_schedule_requests(id,site_code,staff_id,service_date)
  on update cascade on delete restrict;

alter table public.workforce_schedule_exceptions
  add constraint workforce_schedule_exceptions_source_schedule_scope_fkey
  foreign key (source_schedule_entry_id,site_code,staff_id)
  references public.workforce_schedule_entries(id,site_code,staff_id)
  on update cascade on delete set null (source_schedule_entry_id);

alter table public.attendance_records
  add constraint attendance_records_source_schedule_scope_fkey
  foreign key (source_schedule_entry_id,site_code,staff_id)
  references public.workforce_schedule_entries(id,site_code,staff_id)
  on update cascade on delete set null (source_schedule_entry_id);

-- Operational templates/runs must never silently cross branch boundaries.
alter table public.preparation_tasks
  add constraint preparation_tasks_template_site_fkey
  foreign key (template_id,site_code)
  references public.preparation_task_templates(id,site_code)
  on update cascade on delete set null (template_id);

alter table public.remote_job_runs
  add constraint remote_job_runs_template_site_fkey
  foreign key (template_id,site_code)
  references public.remote_job_templates(id,site_code)
  on update cascade on delete restrict;

-- Payroll policy date ranges are site-scoped and may not overlap while active.
-- The transaction advisory lock makes the check safe against concurrent writes
-- without requiring an additional PostgreSQL extension.
create or replace function public.enforce_payroll_policy_no_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.active is false then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll-policy:' || new.site_code, 0));

  if exists (
    select 1
    from public.payroll_policies p
    where p.site_code = new.site_code
      and p.active = true
      and p.id <> new.id
      and daterange(p.effective_from, coalesce(p.effective_to + 1, 'infinity'::date), '[)')
          && daterange(new.effective_from, coalesce(new.effective_to + 1, 'infinity'::date), '[)')
  ) then
    raise exception 'active payroll policy overlaps existing policy for site %', new.site_code
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_policies_no_overlap on public.payroll_policies;
create trigger payroll_policies_no_overlap
before insert or update of site_code,effective_from,effective_to,active
on public.payroll_policies
for each row execute function public.enforce_payroll_policy_no_overlap();

-- Durable idempotency ledger for mutation endpoints. Future APIs that accept an
-- Idempotency-Key must reserve the key in the same transaction as the mutation.
create table if not exists public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  state text not null default 'pending'
    check (state in ('pending','completed','failed')),
  response_status integer check (response_status is null or response_status between 100 and 599),
  response_body jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  site_code text references public.sites(code) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique (scope,idempotency_key),
  check (scope ~ '^[a-z][a-z0-9._-]{1,95}$'),
  check (length(btrim(idempotency_key)) between 8 and 255),
  check (length(btrim(request_hash)) >= 32),
  check (response_body is null or jsonb_typeof(response_body) in ('object','array','string','number','boolean','null')),
  check (expires_at > created_at),
  check (
    (state='pending' and completed_at is null)
    or (state in ('completed','failed') and completed_at is not null)
  )
);

create index if not exists api_idempotency_keys_expiry_idx
  on public.api_idempotency_keys(expires_at);
create index if not exists api_idempotency_keys_site_created_idx
  on public.api_idempotency_keys(site_code,created_at desc)
  where site_code is not null;

-- A backup is not considered operationally proven merely because a dump file
-- exists. Restore verification is append-only evidence tied to backup_history.
create table if not exists public.backup_restore_verifications (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.backup_history(id) on delete restrict,
  status text not null check (status in ('running','succeeded','failed')),
  target_environment text not null default 'verification',
  schema_version text,
  row_checks jsonb not null default '{}'::jsonb,
  checksum_verified boolean,
  verified_by_user_id uuid references public.app_users(id) on delete set null,
  verified_by_name text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  check (length(btrim(target_environment)) > 0),
  check (jsonb_typeof(row_checks) = 'object'),
  check (jsonb_typeof(metadata) = 'object'),
  check (completed_at is null or completed_at >= started_at),
  check (
    (status='running' and completed_at is null)
    or (status in ('succeeded','failed') and completed_at is not null)
  )
);

create index if not exists backup_restore_verifications_backup_idx
  on public.backup_restore_verifications(backup_id,started_at desc);
create index if not exists backup_restore_verifications_status_idx
  on public.backup_restore_verifications(status,started_at desc);

drop trigger if exists backup_restore_verifications_immutable on public.backup_restore_verifications;
create trigger backup_restore_verifications_immutable
before update or delete on public.backup_restore_verifications
for each row execute function public.reject_immutable_history_mutation();

commit;
