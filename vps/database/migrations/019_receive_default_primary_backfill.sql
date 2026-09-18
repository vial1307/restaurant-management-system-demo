begin;

-- Backfill branch-owned receiving defaults only when master data gives one
-- unambiguous primary storage location for a catalog item. This never changes
-- inventory quantity and never overwrites an explicit manager-owned default.
with configured as (
  select
    split_part(i.item_key,':',1) as site,
    i.catalog_key,
    count(distinct l.id) filter (
      where l.active=true and l.kind='storage'
    ) as storage_location_count,
    count(distinct l.id) filter (
      where l.active=true
        and l.kind='storage'
        and coalesce(l.metadata->>'storage_group','service')='primary'
    ) as primary_location_count,
    min(l.id::text) filter (
      where l.active=true
        and l.kind='storage'
        and coalesce(l.metadata->>'storage_group','service')='primary'
    )::uuid as primary_location_id
  from public.inventory_items i
  join public.sites site
    on site.code=split_part(i.item_key,':',1)
   and site.active=true
   and site.metadata->>'inventory_mode'='branch'
  left join public.inventory_stock stock on stock.item_id=i.id
  left join public.inventory_locations l on l.id=stock.location_id
  where i.active=true
  group by split_part(i.item_key,':',1),i.catalog_key
),
inserted as (
  insert into public.inventory_receive_defaults(
    site,catalog_key,location_id,updated_by,updated_at
  )
  select
    c.site,c.catalog_key,c.primary_location_id,null,now()
  from configured c
  where c.storage_location_count > 1
    and c.primary_location_count = 1
    and c.primary_location_id is not null
    and not exists (
      select 1
      from public.inventory_receive_defaults d
      where d.site=c.site and d.catalog_key=c.catalog_key
    )
  on conflict(site,catalog_key) do nothing
  returning site,catalog_key,location_id,updated_at
)
insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system',
  'system_receive_default_backfill',
  'inventory_receive_default',
  inserted.site || ':' || inserted.catalog_key,
  inserted.site,
  null,
  jsonb_build_object(
    'site',inserted.site,
    'catalog_key',inserted.catalog_key,
    'location_id',inserted.location_id,
    'updated_at',inserted.updated_at
  ),
  jsonb_build_object(
    'source','migration_019',
    'policy','unique_primary_storage'
  )
from inserted;

commit;
