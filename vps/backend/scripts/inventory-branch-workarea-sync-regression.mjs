import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const client = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || "kitchen_test",
  user:process.env.POSTGRES_USER || "kitchen_test",
  password:process.env.POSTGRES_PASSWORD || "kitchen_test",
});

const catalogKey="workarea-sync-regression";
const centralItemKey="central:workarea-sync-regression";
const branchItemKey="fuxing:workarea-sync-regression";

await client.connect();
let projectionTriggerDisabled=false;
let canonicalGuardDisabled=false;
try {
  const schema=await client.query("select max(version) as version from public.schema_migrations");
  assert.equal(schema.rows[0]?.version,"030","schema 030 must be active");

  // This regression deliberately replays migration 026. In production 026 ran
  // before migration 027 installed the branch work-projection trigger, so
  // disable only that newer trigger while reconstructing the historical state.
  await client.query("alter table public.inventory_items disable trigger inventory_items_catalog_work_area_guard");
  canonicalGuardDisabled=true;
  await client.query("alter table public.inventory_items disable trigger inventory_items_sync_branch_work_projection");
  projectionTriggerDisabled=true;

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
       ($1,$3,'工作區同步中央測試','Kiểm thử đồng bộ khu Central','包','meat',false,true),
       ($2,$3,'工作區同步分店測試','Kiểm thử đồng bộ khu chi nhánh','包','noodles',false,true)`,
    [centralItemKey,branchItemKey,catalogKey]
  );

  const branchItem=await client.query(
    "select id from public.inventory_items where item_key=$1",
    [branchItemKey]
  );
  const branchItemId=branchItem.rows[0].id;

  await client.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
     values($1,$2,7,3),($1,$3,2,5)
     on conflict(item_id,location_id) do update
     set quantity=excluded.quantity,minimum_quantity=excluded.minimum_quantity,updated_at=now()`,
    [branchItemId,byArea.get("noodles").id,byArea.get("meat").id]
  );

  const before=await client.query(
    `select coalesce(sum(s.quantity),0) as quantity
     from public.inventory_stock s
     join public.inventory_locations l on l.id=s.location_id
     where s.item_id=$1 and l.kind='work'`,
    [branchItemId]
  );
  assert.equal(Number(before.rows[0].quantity),9);

  const migrationPath=path.resolve("vps/database/migrations/026_branch_catalog_workarea_sync.sql");
  await client.query(fs.readFileSync(migrationPath,"utf8"));

  const itemAfter=await client.query(
    "select work_area from public.inventory_items where id=$1",
    [branchItemId]
  );
  assert.equal(itemAfter.rows[0]?.work_area,"meat","branch item did not inherit Central work area");

  const stockAfter=await client.query(
    `select l.metadata->>'work_area' as work_area,s.quantity,s.minimum_quantity
     from public.inventory_stock s
     join public.inventory_locations l on l.id=s.location_id
     where s.item_id=$1 and l.kind='work'
     order by l.code`,
    [branchItemId]
  );
  assert.equal(stockAfter.rowCount,1,"branch work stock was not consolidated into one target work location");
  assert.equal(stockAfter.rows[0].work_area,"meat");
  assert.equal(Number(stockAfter.rows[0].quantity),9,"work-area sync changed physical quantity");
  assert.equal(Number(stockAfter.rows[0].minimum_quantity),5,"work-area sync did not preserve the larger minimum");

  const audit=await client.query(
    `select count(*)::int as count
     from public.audit_logs
     where action='system_inventory_catalog_work_area_sync'
       and entity_id=$1
       and metadata->>'catalog_key'=$2`,
    [String(branchItemId),catalogKey]
  );
  assert.equal(audit.rows[0].count,1,"branch work-area correction was not audit logged");

  await client.query("alter table public.inventory_items enable trigger inventory_items_catalog_work_area_guard");
  canonicalGuardDisabled=false;
  await client.query("alter table public.inventory_items enable trigger inventory_items_sync_branch_work_projection");
  projectionTriggerDisabled=false;

  // Schema 030 keeps rejecting partial direct SQL changes but defers the
  // invariant until transaction commit so Central + branches can move together.
  const sharedBefore=await client.query(
    `select item_key,work_area
     from public.inventory_items
     where catalog_key=$1 and active=true
     order by item_key`,
    [catalogKey]
  );
  assert.ok(sharedBefore.rowCount>=2,"shared catalog fixture missing");

  await assert.rejects(
    client.query("update public.inventory_items set work_area='noodles' where item_key=$1",[branchItemKey]),
    /BRANCH_CATALOG_WORK_AREA_MISMATCH/,
    "branch shared catalog must not drift from Central after schema 029"
  );
  await assert.rejects(
    client.query("update public.inventory_items set work_area='noodles' where item_key=$1",[centralItemKey]),
    /CENTRAL_CATALOG_WORK_AREA_BRANCH_CONFLICT/,
    "Central shared catalog must not move independently of active branches"
  );

  // A coordinated transaction is valid: relocate the branch work projection
  // first, then update Central + branch classification together. The deferred
  // catalog guard validates only the final consistent state.
  await client.query("begin");
  try {
    await client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
       values($1,$2,9,5,now())
       on conflict(item_id,location_id) do update
       set quantity=excluded.quantity,minimum_quantity=excluded.minimum_quantity,updated_at=now()`,
      [branchItemId,byArea.get("noodles").id]
    );
    await client.query(
      "delete from public.inventory_stock where item_id=$1 and location_id=$2",
      [branchItemId,byArea.get("meat").id]
    );
    await client.query(
      `update public.inventory_items
       set work_area='noodles',updated_at=now()
       where item_key=any($1::text[])`,
      [[centralItemKey,branchItemKey]]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const coordinated=await client.query(
    `select item_key,work_area
     from public.inventory_items
     where item_key=any($1::text[])
     order by item_key`,
    [[centralItemKey,branchItemKey]]
  );
  assert.deepEqual(
    coordinated.rows.map((row)=>[row.item_key,row.work_area]),
    [[branchItemKey,"noodles"],[centralItemKey,"noodles"]].sort((a,b)=>a[0].localeCompare(b[0])),
    "coordinated shared catalog Work Area update did not commit atomically"
  );
  const coordinatedStock=await client.query(
    `select l.metadata->>'work_area' as work_area,s.quantity,s.minimum_quantity
     from public.inventory_stock s
     join public.inventory_locations l on l.id=s.location_id
     where s.item_id=$1 and l.kind='work'`,
    [branchItemId]
  );
  assert.equal(coordinatedStock.rowCount,1,"coordinated move left duplicate branch work rows");
  assert.equal(coordinatedStock.rows[0].work_area,"noodles");
  assert.equal(Number(coordinatedStock.rows[0].quantity),9,"coordinated move changed physical quantity");
  assert.equal(Number(coordinatedStock.rows[0].minimum_quantity),5,"coordinated move changed minimum");

  await client.query(
    "delete from public.inventory_stock where item_id in (select id from public.inventory_items where catalog_key=$1)",
    [catalogKey]
  );
  await client.query("delete from public.inventory_items where catalog_key=$1",[catalogKey]);
  await client.query("delete from public.audit_logs where metadata->>'catalog_key'=$1",[catalogKey]);

  console.log("INVENTORY_BRANCH_WORKAREA_SYNC_REGRESSION_OK");
} finally {
  if(canonicalGuardDisabled) {
    try {
      await client.query("alter table public.inventory_items enable trigger inventory_items_catalog_work_area_guard");
    } catch {}
  }
  if(projectionTriggerDisabled) {
    try {
      await client.query("alter table public.inventory_items enable trigger inventory_items_sync_branch_work_projection");
    } catch {}
  }
  await client.end();
}
