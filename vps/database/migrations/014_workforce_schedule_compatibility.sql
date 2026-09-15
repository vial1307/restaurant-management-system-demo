begin;

-- Preserve legacy schedule fields during the additive relational backfill.
-- This migration does not change workforce authority; business_state remains canonical
-- until parity verification and an explicit API cutover are completed.

alter table public.workforce_schedule_entries
  add column if not exists note text not null default '';

alter table public.workforce_schedule_publication_entries
  add column if not exists note text not null default '';

alter table public.workforce_schedule_requests
  add column if not exists legacy_request_id text;

create unique index if not exists workforce_schedule_requests_legacy_uidx
  on public.workforce_schedule_requests(site_code,legacy_request_id)
  where legacy_request_id is not null;

alter table public.workforce_schedule_exceptions
  add column if not exists legacy_exception_id text;

create unique index if not exists workforce_schedule_exceptions_legacy_uidx
  on public.workforce_schedule_exceptions(site_code,legacy_exception_id)
  where legacy_exception_id is not null;

create or replace function public.reject_workforce_schedule_publication_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'workforce schedule publication history is immutable'
    using errcode = '55000';
end;
$$;

drop trigger if exists workforce_schedule_publications_immutable
  on public.workforce_schedule_publications;
create trigger workforce_schedule_publications_immutable
before update or delete on public.workforce_schedule_publications
for each row execute function public.reject_workforce_schedule_publication_mutation();

drop trigger if exists workforce_schedule_publication_entries_immutable
  on public.workforce_schedule_publication_entries;
create trigger workforce_schedule_publication_entries_immutable
before update or delete on public.workforce_schedule_publication_entries
for each row execute function public.reject_workforce_schedule_publication_mutation();

commit;
