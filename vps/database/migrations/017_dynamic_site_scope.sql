begin;

-- Inventory site validity is already enforced by the relational foreign keys
-- added in migration 010. Remove the legacy closed enums from migration 001 so
-- adding a site in public.sites does not require another code/schema edit.
alter table public.inventory_locations
  drop constraint if exists inventory_locations_site_check;

alter table public.inventory_receive_defaults
  drop constraint if exists inventory_receive_defaults_site_check;

-- Account location keeps the special logical scope "all". Every other value
-- must reference a row in public.sites. A trigger is used instead of a foreign
-- key because "all" is a scope sentinel, not a physical site.
alter table public.app_users
  drop constraint if exists app_users_location_check;

create or replace function public.app_user_location_guard()
returns trigger
language plpgsql
as $$
begin
  if new.location = 'all' then
    return new;
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.code = new.location
  ) then
    raise exception using
      errcode = '23503',
      message = 'APP_USER_SITE_NOT_FOUND';
  end if;

  return new;
end;
$$;

drop trigger if exists app_users_location_guard on public.app_users;
create trigger app_users_location_guard
before insert or update of location on public.app_users
for each row execute function public.app_user_location_guard();

commit;
