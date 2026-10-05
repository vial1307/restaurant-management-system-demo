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

const catalogKey="workarea-site-scope-regression";
const centralItemKey="central:workarea-site-scope-regression";
const branchItemKey="fuxing:workarea-site-scope-regression";

await client.connect();
try {
  const schema=await client.query("select max(version) as version from public.schema_migrations");
  assert.equal(schema.rows[0]?.version,"032","schema 032 must be active");

  const catalogGuard=await client.query(
    `select count(*)::int as count
     from pg_trigger
     where tgrelid='public.inventory_items'::regclass
       and tgname='inventory_items_catalog_work_area_guard'
       and not tgisinternal`
  );
  assert.equal(catalogGuard.rows[0]?.count,0,"cross-site catalog Work Area guard must be removed");

  await client.query("delete from public.audit_logs where metadata->>'catalog_key'=$1",[catalogKey]);
  await client.query(
    "delete from public.inventory_stock where item_id in (select id from public.inventory_items where catalog_key=$1)",
    [catalogKey]
  );
  await client.query("delete from public.inventory_items where catalog_key=$1",[catalogKey]);

  const workLocations=await client.query(
    `select code,id,metadata->>'work_area' as work_area
     from public.inventory_locations
     where site='fuxing' and active=true and kind='work'
       and metadata->>'work_area'=any($1::text[])
     order by code`,
    [["noodles","meat"]]
  );
  const byArea=new Map(workLocations.rows.map((row)=>[row.work_area,row]));
  assert(byArea.get("noodles"),"Fuxing noodles work location missing");
  assert(byArea.get("meat"),"Fuxing meat work location missing");

  await client.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values
       ($1,$3,'站點工作區中央測試','Kiểm thử Work Area Central','包','meat',false,true),
       ($2,$3,'站點工作區分店測試','Kiểm thử Work Area chi nhánh','包','meat',true,true)`,
    [centralItemKey,branchItemKey,catalogKey]
  );

  const ids=await client.query(
    "select item_key,id,work_area from public.inventory_items where catalog_key=$1 order by item_key",
    [catalogKey]
  );
  const central=ids.rows.find((row)=>row.item_key===centralItemKey);
  const branch=ids.rows.find((row)=>row.item_key===branchItemKey);
  assert(central && branch,"site-scoped catalog fixtures missing");

  await client.query(
    `update public.inventory_stock
     set quantity=9,minimum_quantity=5,updated_at=now()
     where item_id=$1 and location_id=$2`,
    [branch.id,byArea.get("meat").id]
  );

  await client.query("begin");
  try {
    await client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
       values($1,$2,9,5,now())
       on conflict(item_id,location_id) do update
       set quantity=excluded.quantity,minimum_quantity=excluded.minimum_quantity,updated_at=now()`,
      [branch.id,byArea.get("noodles").id]
    );
    await client.query(
      "delete from public.inventory_stock where item_id=$1 and location_id=$2",
      [branch.id,byArea.get("meat").id]
    );
    await client.query(
      "update public.inventory_items set work_area='noodles',updated_at=now() where id=$1",
      [branch.id]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const after=await client.query(
    "select item_key,work_area from public.inventory_items where catalog_key=$1 order by item_key",
    [catalogKey]
  );
  assert.equal(
    after.rows.find((row)=>row.item_key===centralItemKey)?.work_area,
    "meat",
    "Central Work Area must remain independent from a branch edit"
  );
  assert.equal(
    after.rows.find((row)=>row.item_key===branchItemKey)?.work_area,
    "noodles",
    "branch Work Area did not persist independently"
  );

  const branchWork=await client.query(
    `select l.metadata->>'work_area' as work_area,s.quantity,s.minimum_quantity
     from public.inventory_stock s
     join public.inventory_locations l on l.id=s.location_id
     where s.item_id=$1 and l.active=true and l.kind='work'
     order by l.code`,
    [branch.id]
  );
  assert.equal(branchWork.rowCount,1,"branch Work Area move must leave exactly one work projection");
  assert.equal(branchWork.rows[0].work_area,"noodles");
  assert.equal(Number(branchWork.rows[0].quantity),9,"site-scoped Work Area move changed quantity");
  assert.equal(Number(branchWork.rows[0].minimum_quantity),5,"site-scoped Work Area move changed minimum");

  await assert.rejects(
    client.query("update public.inventory_items set work_area='meat' where id=$1",[branch.id]),
    /BRANCH_WORK_AREA_HAS_PROTECTED_STOCK|INVENTORY_WORK_STOCK_AREA_MISMATCH/,
    "direct metadata-only Work Area change must not bypass local stock integrity"
  );

  await assert.rejects(
    client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,0,0)
       on conflict(item_id,location_id) do update
       set quantity=excluded.quantity,minimum_quantity=excluded.minimum_quantity`,
      [branch.id,byArea.get("meat").id]
    ),
    /INVENTORY_WORK_STOCK_AREA_MISMATCH/,
    "database accepted Work stock outside the item's site-local Work Area"
  );

  console.log("INVENTORY_SITE_SCOPED_WORKAREA_REGRESSION_OK");
} finally {
  try {
    await client.query(
      "delete from public.inventory_stock where item_id in (select id from public.inventory_items where catalog_key=$1)",
      [catalogKey]
    );
    await client.query("delete from public.inventory_items where catalog_key=$1",[catalogKey]);
    await client.query("delete from public.audit_logs where metadata->>'catalog_key'=$1",[catalogKey]);
  } catch {}
  await client.end();
}
