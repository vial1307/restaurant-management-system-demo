begin;

-- Recover inventory that was made invisible by archiving an item while physical
-- stock still existed. Quantity/minimum values are preserved exactly; only the
-- item visibility flag is restored so operators can see and resolve the stock.
with hidden as (
  select
    i.id,
    i.item_key,
    i.catalog_key,
    split_part(i.item_key,':',1) as site,
    jsonb_agg(
      jsonb_build_object(
        'location_id',l.id,
        'location_code',l.code,
        'quantity',s.quantity,
        'minimum_quantity',s.minimum_quantity
      )
      order by l.code
    ) as stock_rows
  from public.inventory_items i
  join public.inventory_stock s on s.item_id=i.id
  join public.inventory_locations l on l.id=s.location_id
  where i.active=false
    and s.quantity>0
  group by i.id,i.item_key,i.catalog_key
),
reactivated as (
  update public.inventory_items i
  set active=true,
      updated_at=now()
  from hidden h
  where i.id=h.id
  returning i.id,i.item_key,i.catalog_key,h.site,h.stock_rows
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_hidden_stock_reactivate',
  'inventory_item',
  r.id::text,
  r.site,
  jsonb_build_object('active',false),
  jsonb_build_object('active',true),
  jsonb_build_object(
    'source','migration_023',
    'item_key',r.item_key,
    'catalog_key',r.catalog_key,
    'reason','inactive_item_had_positive_stock',
    'stock_rows',r.stock_rows
  )
from reactivated r;

-- An item with physical stock must remain visible/active. This trigger protects
-- every write path, not only the dedicated inventory API.
create or replace function public.assert_inventory_item_archive_empty()
returns trigger
language plpgsql
as $$
declare
  protected_rows bigint;
  total_quantity numeric;
  total_minimum numeric;
begin
  if old.active=true and new.active=false then
    select count(*),coalesce(sum(quantity),0),coalesce(sum(minimum_quantity),0)
      into protected_rows,total_quantity,total_minimum
    from public.inventory_stock
    where item_id=old.id
      and (quantity>0 or minimum_quantity>0);

    if protected_rows>0 then
      raise exception using
        errcode='23514',
        message='ITEM_HAS_STOCK',
        detail=format(
          'item_id=%s item_key=%s protected_stock_rows=%s total_quantity=%s total_minimum=%s',
          old.id,old.item_key,protected_rows,total_quantity,total_minimum
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_archive_guard on public.inventory_items;
create trigger inventory_items_archive_guard
before update of active on public.inventory_items
for each row execute function public.assert_inventory_item_archive_empty();

-- Prevent a stale/concurrent writer from recreating positive hidden stock after
-- an item has already been archived.
create or replace function public.assert_inventory_stock_item_active()
returns trigger
language plpgsql
as $$
declare
  item_active boolean;
begin
  if new.quantity>0 or new.minimum_quantity>0 then
    select active into item_active
    from public.inventory_items
    where id=new.item_id;

    if item_active is distinct from true then
      raise exception using
        errcode='23514',
        message='INVENTORY_STOCK_ITEM_INACTIVE',
        detail=format(
          'item_id=%s location_id=%s quantity=%s minimum_quantity=%s',
          new.item_id,new.location_id,new.quantity,new.minimum_quantity
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_stock_active_item_guard on public.inventory_stock;
create trigger inventory_stock_active_item_guard
before insert or update of item_id,quantity,minimum_quantity on public.inventory_stock
for each row execute function public.assert_inventory_stock_item_active();

commit;
