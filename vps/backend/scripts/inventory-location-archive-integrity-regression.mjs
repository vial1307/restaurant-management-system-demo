import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const client = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || "kitchen_test",
  user:process.env.POSTGRES_USER || "kitchen_test",
  password:process.env.POSTGRES_PASSWORD || "kitchen_test",
});

await client.connect();
try {
  const schema=await client.query("select max(version) as version from public.schema_migrations");
  assert.equal(schema.rows[0]?.version,"024","schema 024 must be active");

  const item=await client.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values(
       'fuxing:location-archive-integrity-regression',
       'location-archive-integrity-regression',
       '儲位封存完整性測試',
       'Kiểm thử toàn vẹn vị trí kho',
       '包','noodles',true,true
     )
     on conflict(item_key) do update set active=true,updated_at=now()
     returning id`
  );
  const itemId=item.rows[0].id;

  const location=await client.query(
    `insert into public.inventory_locations(
       code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
     ) values(
       'fuxing-location-archive-integrity-regression',
       '儲位封存測試',
       'Vị trí kiểm thử archive',
       'fuxing','storage',999,true,'{"regression":true}'::jsonb
     )
     on conflict(code) do update set
       active=true,kind='storage',site='fuxing',updated_at=now()
     returning id`
  );
  const locationId=location.rows[0].id;

  await client.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
     values($1,$2,0,2)
     on conflict(item_id,location_id) do update
     set quantity=0,minimum_quantity=2,updated_at=now()`,
    [itemId,locationId]
  );

  await assert.rejects(
    client.query("update public.inventory_locations set active=false where id=$1",[locationId]),
    (error)=>String(error?.message || "").includes("LOCATION_HAS_PROTECTED_STOCK"),
    "location archive guard allowed minimum-only stock configuration to become hidden"
  );

  await client.query(
    "update public.inventory_stock set minimum_quantity=0 where item_id=$1 and location_id=$2",
    [itemId,locationId]
  );

  await client.query(
    `insert into public.inventory_receive_defaults(site,catalog_key,location_id)
     values('fuxing','location-archive-integrity-regression',$1)
     on conflict(site,catalog_key) do update set location_id=excluded.location_id,updated_at=now()`,
    [locationId]
  );

  await assert.rejects(
    client.query("update public.inventory_locations set active=false where id=$1",[locationId]),
    (error)=>String(error?.message || "").includes("LOCATION_IS_RECEIVE_DEFAULT"),
    "location archive guard allowed an active receive-default target to be archived"
  );

  await client.query(
    "delete from public.inventory_receive_defaults where site='fuxing' and catalog_key='location-archive-integrity-regression'"
  );

  const archived=await client.query(
    "update public.inventory_locations set active=false where id=$1 returning active",
    [locationId]
  );
  assert.equal(archived.rows[0]?.active,false,"empty location could not be archived");

  await assert.rejects(
    client.query(
      "update public.inventory_stock set minimum_quantity=1 where item_id=$1 and location_id=$2",
      [itemId,locationId]
    ),
    (error)=>String(error?.message || "").includes("INVENTORY_STOCK_LOCATION_INACTIVE"),
    "inactive location accepted positive minimum configuration"
  );

  await assert.rejects(
    client.query(
      `insert into public.inventory_receive_defaults(site,catalog_key,location_id)
       values('fuxing','location-archive-integrity-regression',$1)
       on conflict(site,catalog_key) do update set location_id=excluded.location_id`,
      [locationId]
    ),
    (error)=>String(error?.message || "").includes("RECEIVE_DEFAULT_LOCATION_INVALID"),
    "inactive location accepted receive-default routing"
  );

  await client.query("delete from public.inventory_stock where item_id=$1 and location_id=$2",[itemId,locationId]);
  await client.query("delete from public.inventory_locations where id=$1",[locationId]);
  await client.query("delete from public.inventory_items where id=$1",[itemId]);

  console.log("INVENTORY_LOCATION_ARCHIVE_INTEGRITY_REGRESSION_OK");
} finally {
  await client.end();
}
