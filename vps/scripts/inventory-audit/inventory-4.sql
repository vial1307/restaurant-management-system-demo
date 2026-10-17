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
select count(*)
from branch_sites b
left join latest_manifest m on m.site=b.code
where m.site is null
   or coalesce(jsonb_array_length(m.metadata->'item_suffixes'),0)<>75
   or exists (
     select 1
     from jsonb_array_elements_text(coalesce(m.metadata->'item_suffixes','[]'::jsonb)) suffix
     where not exists (
       select 1
       from public.inventory_items i
       where i.item_key=b.code||':'||suffix.value
     )
   );
