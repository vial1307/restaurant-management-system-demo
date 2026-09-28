begin;

-- Inventory replenishment behavior is master data. Runtime code must not decide
-- that a storage location is the factory reserve by matching a browser UI key.
-- Backfill the current branch behavior once, then let Super Admin own it.
update public.inventory_locations l
set metadata =
  coalesce(l.metadata,'{}'::jsonb)
  || jsonb_build_object(
       'replenishment_policy',
       case
         when coalesce(nullif(btrim(l.metadata->>'replenishment_policy'),''),'') in ('internal','factory')
           then l.metadata->>'replenishment_policy'
         when exists (
           select 1
           from public.sites s
           where s.code=l.site
             and s.active=true
             and coalesce(s.metadata->>'inventory_mode','')='branch'
         )
         and coalesce(nullif(btrim(l.metadata->>'ui_key'),''),l.code)='large-freezer'
           then 'factory'
         else 'internal'
       end
     )
where l.kind='storage';

update public.inventory_locations
set metadata=coalesce(metadata,'{}'::jsonb)-'replenishment_policy'
where kind='work'
  and metadata ? 'replenishment_policy';

create or replace function public.inventory_location_replenishment_policy_guard()
returns trigger
language plpgsql
as $replenishment_policy_guard$
declare
  policy_code text;
begin
  new.metadata := coalesce(new.metadata,'{}'::jsonb);

  if new.kind='storage' then
    policy_code := coalesce(nullif(btrim(new.metadata->>'replenishment_policy'),''),'internal');
    if policy_code not in ('internal','factory') then
      raise exception 'INVALID_REPLENISHMENT_POLICY';
    end if;
    new.metadata := new.metadata || jsonb_build_object('replenishment_policy',policy_code);
    return new;
  end if;

  new.metadata := new.metadata - 'replenishment_policy';
  return new;
end;
$replenishment_policy_guard$;

drop trigger if exists inventory_locations_replenishment_policy_guard on public.inventory_locations;
create trigger inventory_locations_replenishment_policy_guard
before insert or update of kind,metadata
on public.inventory_locations
for each row execute function public.inventory_location_replenishment_policy_guard();

alter table public.inventory_locations
  drop constraint if exists inventory_locations_replenishment_policy_check;
alter table public.inventory_locations
  add constraint inventory_locations_replenishment_policy_check
  check (
    (kind='storage' and metadata->>'replenishment_policy' in ('internal','factory'))
    or
    (kind='work' and not (metadata ? 'replenishment_policy'))
  );

insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
)
select
  null,
  'system',
  'inventory_replenishment_policy_materialize',
  'inventory_location',
  l.id::text,
  l.site,
  null,
  jsonb_build_object(
    'code',l.code,
    'replenishment_policy',l.metadata->>'replenishment_policy'
  ),
  jsonb_build_object('migration','028')
from public.inventory_locations l
where l.kind='storage'
  and l.active=true;

commit;
