-- Kitchen OS inventory schema v11
-- Normalize legacy central-kitchen manager accounts to the unified manager role.
-- This restores 央廚 庫存管理 permissions without touching inventory data.

begin;

update public.profiles
set role = 'manager',
    permissions = jsonb_set(
      coalesce(permissions, '{}'::jsonb),
      '{inventory}',
      '{"view":true,"edit":true}'::jsonb,
      true
    )
where active = true
  and location = 'central'
  and role = 'central';

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 11;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;
