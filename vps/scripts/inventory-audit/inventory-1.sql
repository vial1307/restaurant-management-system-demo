select 'release|' || coalesce((select max(version) from public.schema_migrations),'000');

select 'site|' || l.site
       || '|items|' || count(distinct i.id)
       || '|stock_rows|' || count(s.*)
       || '|quantity|' || coalesce(sum(s.quantity),0)
from public.inventory_locations l
left join public.inventory_stock s on s.location_id=l.id
left join public.inventory_items i
  on i.id=s.item_id and split_part(i.item_key,':',1)=l.site
where l.active=true
group by l.site
order by l.site;

select 'work_area|' || split_part(i.item_key,':',1)
       || '|' || i.work_area
       || '|items|' || count(*)
from public.inventory_items i
join public.sites st
  on st.code=split_part(i.item_key,':',1)
 and st.active=true
 and coalesce(st.metadata->>'inventory_mode','') in ('central','branch')
where i.active=true
group by split_part(i.item_key,':',1),i.work_area
order by split_part(i.item_key,':',1),i.work_area;

select 'stock_site_mismatch|' || count(*)
from public.inventory_stock s
join public.inventory_items i on i.id=s.item_id
join public.inventory_locations l on l.id=s.location_id
where split_part(i.item_key,':',1)<>l.site;

select 'receive_default_site_mismatch|' || count(*)
from public.inventory_receive_defaults d
join public.inventory_locations l on l.id=d.location_id
where d.site<>l.site;

select 'unknown_item_site|' || count(*)
from public.inventory_items i
left join public.sites st on st.code=split_part(i.item_key,':',1)
where st.code is null;

select 'inactive_item_positive_stock|' || count(*)
from public.inventory_stock s
join public.inventory_items i on i.id=s.item_id
where i.active=false and s.quantity>0;

select 'inactive_item_positive_minimum|' || count(*)
from public.inventory_stock s
join public.inventory_items i on i.id=s.item_id
where i.active=false and s.minimum_quantity>0;

select 'inactive_location_positive_stock|' || count(*)
from public.inventory_stock s
join public.inventory_locations l on l.id=s.location_id
where l.active=false and s.quantity>0;

select 'inactive_location_positive_minimum|' || count(*)
from public.inventory_stock s
join public.inventory_locations l on l.id=s.location_id
where l.active=false and s.minimum_quantity>0;

select 'receive_default_inactive_or_nonstorage|' || count(*)
from public.inventory_receive_defaults d
join public.inventory_locations l on l.id=d.location_id
where l.active=false or l.kind<>'storage';

select 'receive_default_without_active_item|' || count(*)
from public.inventory_receive_defaults d
where not exists (
  select 1
  from public.inventory_items i
  where i.active=true
    and split_part(i.item_key,':',1)=d.site
    and i.catalog_key=d.catalog_key
);

select 'receive_default_not_configured|' || count(*)
from public.inventory_receive_defaults d
where not exists (
  select 1
  from public.inventory_items i
  join public.inventory_stock s on s.item_id=i.id
  where i.active=true
    and split_part(i.item_key,':',1)=d.site
    and i.catalog_key=d.catalog_key
    and s.location_id=d.location_id
);

select 'blank_catalog_key|' || count(*)
from public.inventory_items
where active=true and btrim(catalog_key)='';

select 'invalid_item_key_suffix|' || count(*)
from public.inventory_items
where active=true and btrim(split_part(item_key,':',2))='';

select 'duplicate_active_catalog_site_groups|' || count(*)
from (
  select split_part(item_key,':',1) as site,catalog_key
  from public.inventory_items
  where active=true
  group by split_part(item_key,':',1),catalog_key
  having count(*)>1
) duplicates;

select 'active_item_without_stock_rows|' || count(*)
from public.inventory_items i
where i.active=true
  and not exists (
    select 1 from public.inventory_stock s where s.item_id=i.id
  );

select 'active_item_without_storage_rows|' || count(*)
from public.inventory_items i
where i.active=true
  and not exists (
    select 1
    from public.inventory_stock s
    join public.inventory_locations l on l.id=s.location_id
    where s.item_id=i.id and l.active=true and l.kind='storage'
  );

select 'active_storage_invalid_group_or_policy|' || count(*)
from public.inventory_locations l
where l.active=true
  and l.kind='storage'
  and (
    l.metadata->>'storage_group' not in ('primary','service')
    or l.metadata->>'replenishment_policy' not in ('internal','factory')
    or coalesce(nullif(btrim(l.metadata->>'work_area'),''),'')<>''
  );

select 'active_work_location_storage_policy|' || count(*)
from public.inventory_locations l
where l.active=true
  and l.kind='work'
  and (
    coalesce(nullif(btrim(l.metadata->>'storage_group'),''),'')<>''
    or l.metadata ? 'replenishment_policy'
  );

select 'active_work_location_without_area|' || count(*)
from public.inventory_locations l
left join public.work_areas w
  on w.site_code=l.site
 and w.code=l.metadata->>'work_area'
 and w.active=true
where l.active=true
  and l.kind='work'
  and w.code is null;

select 'active_work_area_without_location|' || count(*)
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
) broken;

select 'work_stock_area_mismatch|' || count(*)
from public.inventory_stock s
join public.inventory_items i on i.id=s.item_id
join public.inventory_locations l on l.id=s.location_id
where l.active=true
  and l.kind='work'
  and l.metadata->>'work_area'<>i.work_area;

select 'active_branch_item_without_work_row|' || count(*)
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
  );

select 'cross_site_work_area_variants|' || count(*)
from (
  select i.catalog_key
  from public.inventory_items i
  join public.sites st
    on st.code=split_part(i.item_key,':',1)
   and st.active=true
   and coalesce(st.metadata->>'inventory_mode','') in ('central','branch')
  where i.active=true
  group by i.catalog_key
  having count(distinct i.work_area)>1
) variants;

select 'detail_cross_site_work_area_variant|' || split_part(i.item_key,':',1)
       || '|' || i.catalog_key
       || '|work_area|' || i.work_area
from public.inventory_items i
where i.active=true
  and i.catalog_key in (
    select v.catalog_key
    from public.inventory_items v
    join public.sites st
      on st.code=split_part(v.item_key,':',1)
     and st.active=true
     and coalesce(st.metadata->>'inventory_mode','') in ('central','branch')
    where v.active=true
    group by v.catalog_key
    having count(distinct v.work_area)>1
  )
order by i.catalog_key,split_part(i.item_key,':',1);

select 'detail_duplicate_catalog|' ||
       split_part(item_key,':',1) || '|' || catalog_key || '|count|' || count(*)
from public.inventory_items
where active=true
group by split_part(item_key,':',1),catalog_key
having count(*)>1
order by split_part(item_key,':',1),catalog_key;

with branch_sites as (
  select st.code
  from public.sites st
  where st.active=true
    and coalesce(st.metadata->>'inventory_mode','')='branch'
    and exists (
      select 1
      from public.inventory_locations l
      where l.site=st.code and l.active=true and l.kind='storage'
    )
),
latest_manifest as (
  select distinct on (a.site)
    a.site,a.metadata,a.created_at,a.id
  from public.audit_logs a
  join branch_sites b on b.code=a.site
  where a.action='system_branch_legacy_catalog_materialize'
  order by a.site,a.created_at desc,a.id desc
)
select 'branch_legacy_catalog_manifest|' || b.code
       || '|expected|' || coalesce(jsonb_array_length(m.metadata->'item_suffixes'),0)
       || '|missing|' ||
          case
            when m.site is null then -1
            else (
              select count(*)
              from jsonb_array_elements_text(coalesce(m.metadata->'item_suffixes','[]'::jsonb)) suffix
              where not exists (
                select 1
                from public.inventory_items i
                where i.item_key=b.code||':'||suffix.value
              )
            )
          end
from branch_sites b
left join latest_manifest m on m.site=b.code
order by b.code;

select 'detail_hidden_stock|' || i.item_key || '|location|' || l.code
       || '|quantity|' || s.quantity || '|minimum|' || s.minimum_quantity
from public.inventory_stock s
join public.inventory_items i on i.id=s.item_id
join public.inventory_locations l on l.id=s.location_id
where (i.active=false or l.active=false)
  and (s.quantity>0 or s.minimum_quantity>0)
order by i.item_key,l.code;
