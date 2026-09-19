begin;

-- Clean only completely empty legacy cross-site rows. Non-zero/minimum rows are
-- never guessed or discarded: migration stops so the operator can inspect them.
delete from public.inventory_stock s
using public.inventory_items i, public.inventory_locations l
where s.item_id=i.id
  and s.location_id=l.id
  and split_part(i.item_key,':',1)<>l.site
  and s.quantity=0
  and s.minimum_quantity=0;

do $$
declare
  bad_stock bigint;
  bad_defaults bigint;
  bad_items bigint;
begin
  select count(*) into bad_items
  from public.inventory_items i
  left join public.sites st on st.code=split_part(i.item_key,':',1)
  where st.code is null;

  select count(*) into bad_stock
  from public.inventory_stock s
  join public.inventory_items i on i.id=s.item_id
  join public.inventory_locations l on l.id=s.location_id
  where split_part(i.item_key,':',1)<>l.site;

  select count(*) into bad_defaults
  from public.inventory_receive_defaults d
  join public.inventory_locations l on l.id=d.location_id
  where d.site<>l.site;

  if bad_items>0 or bad_stock>0 or bad_defaults>0 then
    raise exception
      'INVENTORY_SITE_INTEGRITY_EXISTING_VIOLATION items=% stock=% receive_defaults=%',
      bad_items,bad_stock,bad_defaults;
  end if;
end $$;

create or replace function public.assert_inventory_item_site_exists()
returns trigger
language plpgsql
as $
declare
  item_site text;
begin
  item_site := split_part(new.item_key,':',1);
  if item_site='' or not exists(select 1 from public.sites where code=item_site) then
    raise exception using
      errcode='23514',
      message='INVENTORY_ITEM_SITE_INVALID',
      detail=format('item_key=%s item_site=%s',new.item_key,coalesce(item_site,'?'));
  end if;
  return new;
end;
$;

drop trigger if exists inventory_items_site_guard on public.inventory_items;
create trigger inventory_items_site_guard
before insert or update of item_key on public.inventory_items
for each row execute function public.assert_inventory_item_site_exists();

create or replace function public.assert_inventory_stock_site_match()
returns trigger
language plpgsql
as $$
declare
  item_site text;
  location_site text;
begin
  select split_part(item_key,':',1)
    into item_site
  from public.inventory_items
  where id=new.item_id;

  select site
    into location_site
  from public.inventory_locations
  where id=new.location_id;

  if item_site is null or location_site is null or item_site<>location_site then
    raise exception using
      errcode='23514',
      message='INVENTORY_STOCK_SITE_MISMATCH',
      detail=format('item_site=%s location_site=%s item_id=%s location_id=%s',
                    coalesce(item_site,'?'),coalesce(location_site,'?'),new.item_id,new.location_id);
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_stock_site_guard on public.inventory_stock;
create trigger inventory_stock_site_guard
before insert or update of item_id,location_id on public.inventory_stock
for each row execute function public.assert_inventory_stock_site_match();

create or replace function public.assert_inventory_receive_default_site_match()
returns trigger
language plpgsql
as $$
declare
  location_site text;
begin
  select site
    into location_site
  from public.inventory_locations
  where id=new.location_id;

  if location_site is null or new.site<>location_site then
    raise exception using
      errcode='23514',
      message='INVENTORY_RECEIVE_DEFAULT_SITE_MISMATCH',
      detail=format('default_site=%s location_site=%s location_id=%s',
                    new.site,coalesce(location_site,'?'),new.location_id);
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_receive_defaults_site_guard on public.inventory_receive_defaults;
create trigger inventory_receive_defaults_site_guard
before insert or update of site,location_id on public.inventory_receive_defaults
for each row execute function public.assert_inventory_receive_default_site_match();

commit;
