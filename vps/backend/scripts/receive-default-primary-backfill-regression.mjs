import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.resolve(__dirname, "../../database/migrations/019_receive_default_primary_backfill.sql");
const migrationSql = fs.readFileSync(migrationFile, "utf8");

const db = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});

const catalogKey = "receive-default-primary-backfill-regression";
const itemKey = `fuxing:${catalogKey}`;
const entityId = `fuxing:${catalogKey}`;

await db.connect();
try {
  const locations = await db.query(
    `select id,code,metadata
     from public.inventory_locations
     where code=any($1::text[])
     order by code`,
    [["fuxing-large-freezer","fuxing-four-door"]]
  );
  assert.equal(locations.rowCount, 2, "canonical primary/service Fuxing locations missing");
  const byCode = new Map(locations.rows.map((row) => [row.code,row]));
  assert.equal(byCode.get("fuxing-large-freezer")?.metadata?.storage_group, "primary");
  assert.equal(byCode.get("fuxing-four-door")?.metadata?.storage_group, "service");

  await db.query("delete from public.inventory_receive_defaults where site='fuxing' and catalog_key=$1", [catalogKey]);
  await db.query("delete from public.audit_logs where action='system_receive_default_backfill' and entity_id=$1", [entityId]);
  await db.query("delete from public.inventory_items where item_key=$1", [itemKey]);

  const item = (await db.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values($1,$2,'固定收貨回歸','Kiểm thử fixed receive','包','meat',false,true)
     returning id`,
    [itemKey,catalogKey]
  )).rows[0];

  for (const code of ["fuxing-large-freezer","fuxing-four-door"]) {
    await db.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,0,0)`,
      [item.id,byCode.get(code).id]
    );
  }

  await db.query(migrationSql);

  const first = await db.query(
    `select d.site,d.catalog_key,l.code as location_code
     from public.inventory_receive_defaults d
     join public.inventory_locations l on l.id=d.location_id
     where d.site='fuxing' and d.catalog_key=$1`,
    [catalogKey]
  );
  assert.equal(first.rowCount, 1, "migration 019 did not create receiving default");
  assert.equal(first.rows[0].location_code, "fuxing-large-freezer", "migration 019 did not select the unique primary storage");

  const firstAudit = await db.query(
    `select count(*)::int as count
     from public.audit_logs
     where action='system_receive_default_backfill' and entity_id=$1`,
    [entityId]
  );
  assert.equal(firstAudit.rows[0]?.count, 1, "migration 019 must write one system audit row");

  await db.query(migrationSql);

  const second = await db.query(
    `select d.site,d.catalog_key,l.code as location_code
     from public.inventory_receive_defaults d
     join public.inventory_locations l on l.id=d.location_id
     where d.site='fuxing' and d.catalog_key=$1`,
    [catalogKey]
  );
  assert.equal(second.rowCount, 1, "migration 019 is not idempotent");
  assert.equal(second.rows[0].location_code, "fuxing-large-freezer");

  const secondAudit = await db.query(
    `select count(*)::int as count
     from public.audit_logs
     where action='system_receive_default_backfill' and entity_id=$1`,
    [entityId]
  );
  assert.equal(secondAudit.rows[0]?.count, 1, "idempotent rerun must not duplicate system audit rows");

  console.log("RECEIVE_DEFAULT_PRIMARY_BACKFILL_REGRESSION_OK");
} finally {
  try {
    await db.query("delete from public.inventory_receive_defaults where site='fuxing' and catalog_key=$1", [catalogKey]);
    await db.query("delete from public.audit_logs where action='system_receive_default_backfill' and entity_id=$1", [entityId]);
    await db.query("delete from public.inventory_items where item_key=$1", [itemKey]);
  } catch {}
  await db.end();
}
