select
  (select count(*)
   from public.inventory_locations l
   where l.active=true
     and l.kind='storage'
     and (
       l.metadata->>'storage_group' not in ('primary','service')
       or l.metadata->>'replenishment_policy' not in ('internal','factory')
       or coalesce(nullif(btrim(l.metadata->>'work_area'),''),'')<>''
     ))
  +
  (select count(*)
   from public.inventory_locations l
   where l.active=true
     and l.kind='work'
     and (
       coalesce(nullif(btrim(l.metadata->>'storage_group'),''),'')<>''
       or l.metadata ? 'replenishment_policy'
     ))
  +
  (select count(*)
   from public.inventory_locations l
   left join public.work_areas w
     on w.site_code=l.site
    and w.code=l.metadata->>'work_area'
    and w.active=true
   where l.active=true
     and l.kind='work'
     and w.code is null)
  +
  (select count(*)
   from (
     select w.site_code,w.code
     from public.work_areas w
     left join public.inventory_locations l
       on l.site=w.site_code
      and l.kind='work'
      and l.active=true
      and l.metadata->>'work_area'=w.code
     where w.active=true
     group by w.site_code,w.code
     having count(l.id)<>1
   ) broken)
  +
  (select count(*)
   from public.inventory_stock s
   join public.inventory_items i on i.id=s.item_id
   join public.inventory_locations l on l.id=s.location_id
   where l.active=true
     and l.kind='work'
     and l.metadata->>'work_area'<>i.work_area)
  +
  (select count(*)
   from public.inventory_items i
   join public.sites st
     on st.code=split_part(i.item_key,':',1)
    and st.active=true
    and coalesce(st.metadata->>'inventory_mode','')='branch'
   join public.work_areas w
     on w.site_code=st.code
    and w.code=i.work_area
    and w.active=true
   where i.active=true
     and not exists (
       select 1
       from public.inventory_stock s
       join public.inventory_locations l
         on l.id=s.location_id
        and l.site=st.code
        and l.kind='work'
        and l.active=true
        and l.metadata->>'work_area'=i.work_area
       where s.item_id=i.id
     ));
