begin;

alter table public.business_state
  add column if not exists module_revisions jsonb not null default '{}'::jsonb;

update public.business_state b
set module_revisions = coalesce((
  select jsonb_object_agg(module_name, to_jsonb(greatest(b.revision, 0)))
  from jsonb_object_keys(b.modules) as module_keys(module_name)
), '{}'::jsonb);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_state_module_revisions_object_chk'
      and conrelid = 'public.business_state'::regclass
  ) then
    alter table public.business_state
      add constraint business_state_module_revisions_object_chk
      check (jsonb_typeof(module_revisions) = 'object');
  end if;
end $$;

commit;
