select
  (select count(*)
   from public.inventory_stock s
   join public.inventory_items i on i.id=s.item_id
   where i.active=false and (s.quantity>0 or s.minimum_quantity>0))
  +
  (select count(*)
   from public.inventory_stock s
   join public.inventory_locations l on l.id=s.location_id
   where l.active=false and (s.quantity>0 or s.minimum_quantity>0))
  +
  (select count(*)
   from public.inventory_receive_defaults d
   join public.inventory_locations l on l.id=d.location_id
   where l.active=false or l.kind<>'storage')
  +
  (select count(*)
   from public.inventory_receive_defaults d
   where not exists (
     select 1
     from public.inventory_items i
     join public.inventory_stock s on s.item_id=i.id
     where i.active=true
       and split_part(i.item_key,':',1)=d.site
       and i.catalog_key=d.catalog_key
       and s.location_id=d.location_id
   ));
