import { pool } from "./db.mjs";

export async function readInventorySnapshot(site, { includeInactive = false } = {}) {
  const [locations,items,stock,defaults] = await Promise.all([
    pool.query(
      `select id,code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
       from public.inventory_locations
       where site=$1 and active=true
       order by sort_order,code`,
      [site]
    ),
    pool.query(
      `select id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,
              storage_only,active,created_at,updated_at,revision::text as revision
       from public.inventory_items
       where (active=true or $2::boolean)
         and split_part(item_key,':',1)=$1
       order by name_zh_tw,item_key`,
      [site,includeInactive]
    ),
    pool.query(
      `select s.item_id,s.location_id,s.quantity,s.minimum_quantity,s.updated_at
       from public.inventory_stock s
       join public.inventory_locations l on l.id=s.location_id
       join public.inventory_items i on i.id=s.item_id
       where l.site=$1 and l.active=true
         and i.active=true
         and split_part(i.item_key,':',1)=$1`,
      [site]
    ),
    pool.query(
      `select d.site,d.catalog_key,d.location_id,d.updated_at,l.code as location_code
       from public.inventory_receive_defaults d
       join public.inventory_locations l on l.id=d.location_id
       where d.site=$1`,
      [site]
    ),
  ]);

  return {
    site,
    items:items.rows,
    locations:locations.rows,
    stock:stock.rows,
    receiveDefaults:defaults.rows,
  };
}
