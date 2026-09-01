-- Kitchen OS inventory schema v9
-- Optional fixed receive locations for frequently used products.
-- A missing default means staff choose the destination storage for each 出貨.
-- The shipment choice itself NEVER creates a default automatically.

begin;

create table if not exists public.inventory_receive_defaults (
  id uuid primary key default gen_random_uuid(),
  site text not null check (site in ('central','fuxing','yongji')),
  catalog_key text not null,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (site,catalog_key)
);

create index if not exists inventory_receive_defaults_site_idx
  on public.inventory_receive_defaults(site);
create index if not exists inventory_receive_defaults_catalog_idx
  on public.inventory_receive_defaults(catalog_key);

alter table public.inventory_receive_defaults enable row level security;

drop policy if exists inventory_receive_defaults_read on public.inventory_receive_defaults;
create policy inventory_receive_defaults_read
on public.inventory_receive_defaults
for select
to authenticated
using (
  coalesce((select private.has_permission('inventory','view')),false)
);

-- Writes use the RPC below so site/location validation remains centralized.
revoke insert, update, delete on public.inventory_receive_defaults from anon, authenticated;
grant select on public.inventory_receive_defaults to authenticated;

create or replace function public.set_inventory_receive_default(
  p_site text,
  p_catalog_key text,
  p_location_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile_location text;
  v_location_id uuid;
  v_location_site text;
  v_location_kind text;
begin
  select p.role,p.location
    into v_role,v_profile_location
  from public.profiles p
  where p.id=(select auth.uid())
    and p.active=true;

  if v_role is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not coalesce((select private.has_permission('inventory','edit')),false) then
    raise exception 'INVENTORY_EDIT_NOT_ALLOWED';
  end if;

  if p_site not in ('central','fuxing','yongji') then
    raise exception 'INVALID_SITE';
  end if;

  -- Admin may configure any site. A manager may configure only their own site.
  if v_role <> 'admin'
     and not (v_role='manager' and v_profile_location=p_site) then
    raise exception 'RECEIVE_DEFAULT_EDIT_NOT_ALLOWED';
  end if;

  if nullif(trim(p_catalog_key),'') is null then
    raise exception 'CATALOG_KEY_REQUIRED';
  end if;

  -- Blank/null means "not fixed": every shipment may choose the destination.
  if nullif(trim(coalesce(p_location_code,'')),'') is null then
    delete from public.inventory_receive_defaults
    where site=p_site and catalog_key=trim(p_catalog_key);
    return true;
  end if;

  select l.id,l.site,l.kind
    into v_location_id,v_location_site,v_location_kind
  from public.inventory_locations l
  where l.code=trim(p_location_code)
    and l.active=true
  limit 1;

  if v_location_id is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;
  if v_location_site<>p_site or v_location_kind<>'storage' then
    raise exception 'INVALID_RECEIVE_LOCATION';
  end if;

  insert into public.inventory_receive_defaults(
    site,catalog_key,location_id,updated_by,updated_at
  ) values(
    p_site,trim(p_catalog_key),v_location_id,(select auth.uid()),now()
  )
  on conflict (site,catalog_key) do update
  set location_id=excluded.location_id,
      updated_by=excluded.updated_by,
      updated_at=now();

  return true;
end;
$$;

revoke all on function public.set_inventory_receive_default(text,text,text) from public, anon;
grant execute on function public.set_inventory_receive_default(text,text,text) to authenticated;

create or replace function public.kitchen_inventory_schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 9;
$$;

revoke all on function public.kitchen_inventory_schema_version() from public, anon;
grant execute on function public.kitchen_inventory_schema_version() to authenticated;

commit;
