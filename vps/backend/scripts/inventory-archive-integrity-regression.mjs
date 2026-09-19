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

await client.connect();
try {
  const location = await client.query(
    `select id from public.inventory_locations
     where site='fuxing' and code='fuxing-large-freezer' and active=true
     limit 1`
  );
  assert.equal(location.rowCount,1,"canonical Fuxing freezer missing");

  const created = await client.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values(
       'fuxing:archive-integrity-db-regression',
       'archive-integrity-db-regression',
       '封存完整性測試',
       'Kiểm thử toàn vẹn lưu trữ',
       '包','noodles',true,true
     )
     on conflict(item_key) do update set active=true,updated_at=now()
     returning id`
  );
  const itemId=created.rows[0].id;
  const locationId=location.rows[0].id;

  await client.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
     values($1,$2,2,1)
     on conflict(item_id,location_id) do update
     set quantity=2,minimum_quantity=1,updated_at=now()`,
    [itemId,locationId]
  );

  // Recreate the exact pre-023 defect, then rerun the migration to prove it
  // restores visibility without changing quantity/minimum.
  await client.query("alter table public.inventory_items disable trigger inventory_items_archive_guard");
  await client.query("alter table public.inventory_stock disable trigger inventory_stock_active_item_guard");
  await client.query("update public.inventory_items set active=false where id=$1",[itemId]);
  await client.query("alter table public.inventory_items enable trigger inventory_items_archive_guard");
  await client.query("alter table public.inventory_stock enable trigger inventory_stock_active_item_guard");

  const migrationPath=path.resolve("vps/database/migrations/023_inventory_archive_integrity.sql");
  await client.query(fs.readFileSync(migrationPath,"utf8"));

  const recovered=await client.query(
    `select i.active,s.quantity,s.minimum_quantity
     from public.inventory_items i
     join public.inventory_stock s on s.item_id=i.id and s.location_id=$2
     where i.id=$1`,
    [itemId,locationId]
  );
  assert.equal(recovered.rowCount,1);
  assert.equal(recovered.rows[0].active,true,"migration 023 did not reactivate hidden positive stock");
  assert.equal(Number(recovered.rows[0].quantity),2,"migration 023 changed physical quantity");
  assert.equal(Number(recovered.rows[0].minimum_quantity),1,"migration 023 changed minimum quantity");

  const audit=await client.query(
    `select count(*)::int as count
     from public.audit_logs
     where action='system_inventory_hidden_stock_reactivate'
       and entity_id=$1`,
    [String(itemId)]
  );
  assert(audit.rows[0].count>=1,"hidden-stock recovery was not audit logged");

  await assert.rejects(
    client.query("update public.inventory_items set active=false where id=$1",[itemId]),
    (error)=>String(error?.message || "").includes("ITEM_HAS_STOCK"),
    "database archive guard did not reject positive stock"
  );

  await client.query(
    "update public.inventory_stock set quantity=0,minimum_quantity=0 where item_id=$1 and location_id=$2",
    [itemId,locationId]
  );
  const archived=await client.query(
    "update public.inventory_items set active=false where id=$1 returning active",
    [itemId]
  );
  assert.equal(archived.rows[0].active,false,"empty item could not be archived");

  await assert.rejects(
    client.query(
      "update public.inventory_stock set quantity=1 where item_id=$1 and location_id=$2",
      [itemId,locationId]
    ),
    (error)=>String(error?.message || "").includes("INVENTORY_STOCK_ITEM_INACTIVE"),
    "inactive item accepted positive hidden stock"
  );

  await client.query("delete from public.inventory_stock where item_id=$1",[itemId]);
  await client.query("delete from public.inventory_items where id=$1",[itemId]);

  console.log("INVENTORY_ARCHIVE_INTEGRITY_REGRESSION_OK");
} finally {
  await client.end();
}
