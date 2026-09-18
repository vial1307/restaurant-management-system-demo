begin;

-- Synchronize only catalog identity names that have a strict cross-site
-- majority. Each site contributes one vote, so duplicate rows inside one site
-- can never outweigh another site. Operational metadata (unit/work_area/
-- storage_only) is deliberately site-owned and is not changed here.

create temporary table inventory_identity_majority on commit drop as
with active_site_items as (
  select
    split_part(i.item_key,':',1) as site,
    i.catalog_key,
    array_agg(distinct i.name_vi order by i.name_vi) as names_vi,
    array_agg(distinct i.name_zh_tw order by i.name_zh_tw) as names_zh_tw
  from public.inventory_items i
  join public.sites s
    on s.code=split_part(i.item_key,':',1)
   and s.active=true
   and coalesce(s.metadata->>'inventory_mode','') in ('central','branch')
  where i.active=true
  group by split_part(i.item_key,':',1),i.catalog_key
),
catalog_sites as (
  select catalog_key,count(*)::int as site_count
  from active_site_items
  group by catalog_key
),
vi_votes as (
  select a.catalog_key,a.names_vi[1] as candidate,count(*)::int as votes
  from active_site_items a
  where cardinality(a.names_vi)=1
  group by a.catalog_key,a.names_vi[1]
),
vi_majority as (
  select v.catalog_key,v.candidate as name_vi
  from vi_votes v
  join catalog_sites c using(catalog_key)
  where v.votes * 2 > c.site_count
),
zh_votes as (
  select a.catalog_key,a.names_zh_tw[1] as candidate,count(*)::int as votes
  from active_site_items a
  where cardinality(a.names_zh_tw)=1
  group by a.catalog_key,a.names_zh_tw[1]
),
zh_majority as (
  select v.catalog_key,v.candidate as name_zh_tw
  from zh_votes v
  join catalog_sites c using(catalog_key)
  where v.votes * 2 > c.site_count
)
select
  c.catalog_key,
  v.name_vi,
  z.name_zh_tw
from catalog_sites c
left join vi_majority v using(catalog_key)
left join zh_majority z using(catalog_key)
where v.name_vi is not null or z.name_zh_tw is not null;

with targets as (
  select
    i.id,
    i.item_key,
    i.catalog_key,
    i.name_vi as before_name,
    m.name_vi as after_name,
    split_part(i.item_key,':',1) as site
  from public.inventory_items i
  join inventory_identity_majority m using(catalog_key)
  where i.active=true
    and m.name_vi is not null
    and i.name_vi is distinct from m.name_vi
),
updated as (
  update public.inventory_items i
  set name_vi=t.after_name,
      updated_at=now()
  from targets t
  where i.id=t.id
  returning i.id,i.item_key,i.catalog_key,t.site,t.before_name,i.name_vi as after_name
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_identity_majority_sync',
  'inventory_item',
  u.id::text,
  u.site,
  jsonb_build_object('name_vi',u.before_name),
  jsonb_build_object('name_vi',u.after_name),
  jsonb_build_object(
    'source','migration_020',
    'policy','strict_site_majority',
    'catalog_key',u.catalog_key,
    'field','name_vi'
  )
from updated u;

with targets as (
  select
    i.id,
    i.item_key,
    i.catalog_key,
    i.name_zh_tw as before_name,
    m.name_zh_tw as after_name,
    split_part(i.item_key,':',1) as site
  from public.inventory_items i
  join inventory_identity_majority m using(catalog_key)
  where i.active=true
    and m.name_zh_tw is not null
    and i.name_zh_tw is distinct from m.name_zh_tw
),
updated as (
  update public.inventory_items i
  set name_zh_tw=t.after_name,
      updated_at=now()
  from targets t
  where i.id=t.id
  returning i.id,i.item_key,i.catalog_key,t.site,t.before_name,i.name_zh_tw as after_name
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_inventory_identity_majority_sync',
  'inventory_item',
  u.id::text,
  u.site,
  jsonb_build_object('name_zh_tw',u.before_name),
  jsonb_build_object('name_zh_tw',u.after_name),
  jsonb_build_object(
    'source','migration_020',
    'policy','strict_site_majority',
    'catalog_key',u.catalog_key,
    'field','name_zh_tw'
  )
from updated u;

commit;
