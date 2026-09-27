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

async function scalar(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Number(Object.values(rows[0] || {})[0] || 0);
}

await client.connect();
try {
  const schema=await client.query("select max(version) as version from public.schema_migrations");
  assert.equal(schema.rows[0]?.version,"025","schema 025 must be active");

  assert.equal(await scalar(`
    select count(*)
    from public.work_areas area
    join public.sites site
      on site.code=area.site_code
     and site.active=true
     and coalesce(site.metadata->>'inventory_mode','') in ('central','branch')
    where area.active=true
      and not exists (
        select 1 from public.inventory_locations location
        where location.site=area.site_code
          and location.kind='work'
          and location.active=true
          and btrim(coalesce(location.metadata->>'work_area',''))=area.code
      )
  `),0,"active work area is missing a mapped active work location");

  assert.equal(await scalar(`
    select count(*)
    from public.inventory_locations location
    where location.active=true
      and location.kind='work'
      and not exists (
        select 1 from public.work_areas area
        where area.site_code=location.site
          and area.code=btrim(coalesce(location.metadata->>'work_area',''))
          and area.active=true
      )
  `),0,"active work location points to missing/inactive work-area master data");

  assert.equal(await scalar(`
    select count(*)
    from public.inventory_stock stock
    join public.inventory_items item on item.id=stock.item_id
    join public.inventory_locations location on location.id=stock.location_id
    where location.kind='work'
      and (stock.quantity>0 or stock.minimum_quantity>0)
      and (
        location.site<>split_part(item.item_key,':',1)
        or btrim(coalesce(location.metadata->>'work_area',''))<>item.work_area
      )
  `),0,"protected work stock is attached to the wrong work area");

  assert.equal(await scalar(`
    select count(*)
    from (
      select i.catalog_key
      from public.inventory_items i
      join public.sites site
        on site.code=split_part(i.item_key,':',1)
       and site.active=true
       and coalesce(site.metadata->>'inventory_mode','') in ('central','branch')
      where i.active=true
      group by i.catalog_key
      having count(distinct split_part(i.item_key,':',1))>1
         and count(distinct i.work_area)>1
    ) variants
  `),0,"cross-site catalog work-area drift remains after migration 025");

  assert.equal(await scalar(`
    select count(distinct trigger_name)
    from information_schema.triggers
    where trigger_schema='public'
      and trigger_name in (
        'inventory_locations_work_area_guard',
        'inventory_stock_work_area_guard',
        'inventory_items_work_area_stock_guard'
      )
  `),3,"all three inventory work-area parity triggers must be installed");

  await client.query("begin");
  try {
    await client.query("savepoint invalid_work_location");
    await assert.rejects(
      client.query(`
        insert into public.inventory_locations(
          code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
        ) values(
          'fuxing-invalid-work-area-regression',
          '錯誤工作區測試','Kiểm thử khu sai',
          'fuxing','work',999,true,
          '{"ui_key":"invalid-regression","work_area":"missing-area"}'::jsonb
        )
      `),
      (error)=>String(error?.message || "").includes("INVENTORY_WORK_LOCATION_AREA_INVALID"),
      "database accepted an active work location with no work-area master row",
    );
    await client.query("rollback to savepoint invalid_work_location");

    const beef=(await client.query(
      "select id from public.inventory_items where item_key='fuxing:beef'"
    )).rows[0];
    const noodleWork=(await client.query(
      "select id from public.inventory_locations where code='fuxing-work-noodles' and active=true"
    )).rows[0];
    assert(beef?.id && noodleWork?.id,"regression fixture is missing Fuxing beef/noodle work location");

    await client.query("savepoint mismatched_work_stock");
    await assert.rejects(
      client.query(
        "update public.inventory_stock set quantity=1 where item_id=$1 and location_id=$2",
        [beef.id,noodleWork.id],
      ),
      (error)=>String(error?.message || "").includes("INVENTORY_WORK_STOCK_AREA_MISMATCH"),
      "database accepted protected work stock in a location mapped to another area",
    );
    await client.query("rollback to savepoint mismatched_work_stock");

    const meatWork=(await client.query(
      "select id from public.inventory_locations where code='fuxing-work-meat' and active=true"
    )).rows[0];
    assert(meatWork?.id,"regression fixture is missing Fuxing meat work location");
    await client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,1,0)
       on conflict(item_id,location_id) do update set quantity=1,minimum_quantity=0`,
      [beef.id,meatWork.id],
    );

    await client.query("savepoint protected_work_area_change");
    await assert.rejects(
      client.query("update public.inventory_items set work_area='noodles' where id=$1",[beef.id]),
      (error)=>String(error?.message || "").includes("INVENTORY_WORK_AREA_HAS_PROTECTED_STOCK"),
      "database allowed work_area to change while protected work stock remained in the prior area",
    );
    await client.query("rollback to savepoint protected_work_area_change");
  } finally {
    await client.query("rollback");
  }

  console.log("INVENTORY_WORK_AREA_PARITY_REGRESSION_OK");
} finally {
  await client.end();
}
