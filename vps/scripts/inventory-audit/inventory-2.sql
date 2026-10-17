select
  (select count(*)
   from public.inventory_stock s
   join public.inventory_items i on i.id=s.item_id
   join public.inventory_locations l on l.id=s.location_id
   where split_part(i.item_key,':',1)<>l.site)
  +
  (select count(*)
   from public.inventory_receive_defaults d
   join public.inventory_locations l on l.id=d.location_id
   where d.site<>l.site)
  +
  (select count(*)
   from public.inventory_items i
   left join public.sites st on st.code=split_part(i.item_key,':',1)
   where st.code is null);
