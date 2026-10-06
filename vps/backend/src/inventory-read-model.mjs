import { pool } from "./db.mjs";

export async function readInventorySnapshot(site, { includeInactive = false } = {}) {
  const [locations,items,stock,defaults,categories,units] = await Promise.all([
    pool.query(
      `select id,code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
       from public.inventory_locations
       where site=$1 and active=true
       order by sort_order,code`,
      [site]
    ),
    pool.query(
      `select id,item_key,catalog_key,name_zh_tw,name_vi,unit,unit_code,category_code,work_area,
              storage_only,active,created_at,updated_at,revision::text as revision
       from public.inventory_items
       where (active=true or $2::boolean)
         and split_part(item_key,':',1)=$1
       order by name_zh_tw,item_key`,
      [site,includeInactive]
    ),
    pool.query(
      `select
         s.item_id,s.location_id,s.quantity,s.minimum_quantity,
         s.minimum_enabled,s.warning_enabled,s.warning_quantity,s.updated_at,
         coalesce(il.is_primary,false) as is_primary,
         coalesce(il.display_order,l.sort_order,0) as display_order,
         coalesce(il.active,true) as configured
       from public.inventory_stock s
       join public.inventory_locations l on l.id=s.location_id
       join public.inventory_items i on i.id=s.item_id
       left join public.inventory_item_locations il
         on il.item_id=s.item_id and il.location_id=s.location_id
       where l.site=$1 and l.active=true
         and i.active=true
         and split_part(i.item_key,':',1)=$1
       order by i.item_key,
                case when coalesce(il.is_primary,false) then 0
                     when l.kind='work' then 1 else 2 end,
                coalesce(il.display_order,l.sort_order,0),l.code`,
      [site]
    ),
    pool.query(
      `select d.site,d.catalog_key,d.location_id,d.updated_at,l.code as location_code
       from public.inventory_receive_defaults d
       join public.inventory_locations l on l.id=d.location_id
       where d.site=$1`,
      [site]
    ),
    pool.query(
      `select code,name_vi,name_zh_tw,sort_order,active,metadata
       from public.inventory_categories
       where active=true
       order by sort_order,code`
    ),
    pool.query(
      `select code,symbol,name_vi,name_zh_tw,unit_type,sort_order,active,metadata
       from public.inventory_units
       where active=true
       order by sort_order,code`
    ),
  ]);

  return {
    site,
    items:items.rows,
    locations:locations.rows,
    stock:stock.rows,
    receiveDefaults:defaults.rows,
    categories:categories.rows,
    units:units.rows,
  };
}
