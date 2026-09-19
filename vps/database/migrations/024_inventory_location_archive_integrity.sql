begin;

-- A location with operational stock/configuration must remain active and visible.
-- This protects all write paths, including future/admin code that bypasses the
-- dedicated master-data API.
create or replace function public.assert_inventory_location_archive_empty()
returns trigger
language plpgsql
as $$
declare
  protected_rows bigint;
  receive_defaults bigint;
  total_quantity numeric;
  total_minimum numeric;
begin
  if old.active=true and new.active=false then
    select
      count(*),
      coalesce(sum(quantity),0),
      coalesce(sum(minimum_quantity),0)
    into protected_rows,total_quantity,total_minimum
    from public.inventory_stock
    where location_id=old.id
      and (quantity>0 or minimum_quantity>0);

    if protected_rows>0 then
      raise exception using
        errcode='23514',
        message='LOCATION_HAS_PROTECTED_STOCK',
        detail=format(
          'location_id=%s code=%s protected_stock_rows=%s total_quantity=%s total_minimum=%s',
          old.id,old.code,protected_rows,total_quantity,total_minimum
        );
    end if;

    select count(*)
      into receive_defaults
    from public.inventory_receive_defaults
    where location_id=old.id;

    if receive_defaults>0 then
      raise exception using
        errcode='23514',
        message='LOCATION_IS_RECEIVE_DEFAULT',
        detail=format(
          'location_id=%s code=%s receive_defaults=%s',
          old.id,old.code,receive_defaults
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_locations_archive_guard on public.inventory_locations;
create trigger inventory_locations_archive_guard
before update of active on public.inventory_locations
for each row execute function public.assert_inventory_location_archive_empty();

-- A stale/concurrent writer must not recreate hidden stock/config on an inactive
-- location after it has been archived.
create or replace function public.assert_inventory_stock_location_active()
returns trigger
language plpgsql
as $$
declare
  location_active boolean;
begin
  if new.quantity>0 or new.minimum_quantity>0 then
    select active into location_active
    from public.inventory_locations
    where id=new.location_id;

    if location_active is distinct from true then
      raise exception using
        errcode='23514',
        message='INVENTORY_STOCK_LOCATION_INACTIVE',
        detail=format(
          'item_id=%s location_id=%s quantity=%s minimum_quantity=%s',
          new.item_id,new.location_id,new.quantity,new.minimum_quantity
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_stock_active_location_guard on public.inventory_stock;
create trigger inventory_stock_active_location_guard
before insert or update of location_id,quantity,minimum_quantity on public.inventory_stock
for each row execute function public.assert_inventory_stock_location_active();

-- Receive-default routing must always target a currently active storage location.
create or replace function public.assert_inventory_receive_default_location_active()
returns trigger
language plpgsql
as $$
declare
  location_active boolean;
  location_kind text;
begin
  select active,kind
    into location_active,location_kind
  from public.inventory_locations
  where id=new.location_id;

  if location_active is distinct from true or location_kind is distinct from 'storage' then
    raise exception using
      errcode='23514',
      message='RECEIVE_DEFAULT_LOCATION_INVALID',
      detail=format(
        'site=%s catalog_key=%s location_id=%s active=%s kind=%s',
        new.site,new.catalog_key,new.location_id,location_active,location_kind
      );
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_receive_defaults_active_location_guard on public.inventory_receive_defaults;
create trigger inventory_receive_defaults_active_location_guard
before insert or update of location_id on public.inventory_receive_defaults
for each row execute function public.assert_inventory_receive_default_location_active();

commit;
