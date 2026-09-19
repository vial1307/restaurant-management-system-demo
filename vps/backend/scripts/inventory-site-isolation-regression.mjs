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
  const schema = await client.query("select max(version) as version from public.schema_migrations");
  assert.equal(schema.rows[0]?.version, "023", "schema 023 must be active");

  const sites = await client.query(
    `select code from public.sites where code in ('fuxing','yongji') order by code`
  );
  assert.deepEqual(sites.rows.map((row) => row.code), ["fuxing","yongji"]);

  await assert.rejects(
    client.query(
      `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
       ) values('ghost:site-isolation-regression','ghost-site-isolation','錯誤站點','Site sai','包','noodles',false,true)`
    ),
    (error) => error?.code === "23514" && /INVENTORY_ITEM_SITE_INVALID/.test(String(error?.message || ""))
  );

  const item = await client.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values('fuxing:site-isolation-regression','site-isolation-regression','站點隔離測試','Kiểm thử cách ly','包','noodles',false,true)
     on conflict(item_key) do update set active=true
     returning id`
  );
  const itemId = item.rows[0].id;

  const fxLocation = await client.query(
    `select id from public.inventory_locations where code='fuxing-large-freezer' and active=true limit 1`
  );
  const yjLocation = await client.query(
    `select id from public.inventory_locations where code='yongji-large-freezer' and active=true limit 1`
  );
  assert.equal(fxLocation.rowCount,1);
  assert.equal(yjLocation.rowCount,1);

  await client.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
     values($1,$2,3,1)
     on conflict(item_id,location_id) do update set quantity=excluded.quantity,minimum_quantity=excluded.minimum_quantity`,
    [itemId,fxLocation.rows[0].id]
  );

  await assert.rejects(
    client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,2,0)
       on conflict(item_id,location_id) do update set quantity=excluded.quantity`,
      [itemId,yjLocation.rows[0].id]
    ),
    (error) => error?.code === "23514" && /INVENTORY_STOCK_SITE_MISMATCH/.test(String(error?.message || ""))
  );

  await assert.rejects(
    client.query(
      `insert into public.inventory_receive_defaults(site,catalog_key,location_id)
       values('fuxing','site-isolation-regression',$1)
       on conflict(site,catalog_key) do update set location_id=excluded.location_id`,
      [yjLocation.rows[0].id]
    ),
    (error) => error?.code === "23514" && /INVENTORY_RECEIVE_DEFAULT_SITE_MISMATCH/.test(String(error?.message || ""))
  );

  const mismatch = await client.query(
    `select count(*)::int as count
     from public.inventory_stock s
     join public.inventory_items i on i.id=s.item_id
     join public.inventory_locations l on l.id=s.location_id
     where split_part(i.item_key,':',1)<>l.site`
  );
  assert.equal(mismatch.rows[0].count,0);

  const triggerCount = await client.query(
    `select count(distinct trigger_name)::int as count
     from information_schema.triggers
     where trigger_schema='public'
       and trigger_name in ('inventory_items_site_guard','inventory_stock_site_guard','inventory_receive_defaults_site_guard')`
  );
  assert.equal(triggerCount.rows[0].count,3);

  console.log("INVENTORY_SITE_ISOLATION_DATABASE_OK");
} finally {
  await client.end();
}
