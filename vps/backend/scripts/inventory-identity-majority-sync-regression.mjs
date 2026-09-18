import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.resolve(__dirname, "../../database/migrations/020_inventory_identity_majority_sync.sql");
const migrationSql = fs.readFileSync(migrationFile, "utf8");

const db = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});

const majorityKey = "identity-majority-regression";
const tieKey = "identity-tie-regression";
const majorityItemKeys = [
  "central:identity-majority-regression",
  "fuxing:identity-majority-regression",
  "yongji:identity-majority-regression",
];
const tieItemKeys = [
  "fuxing:identity-tie-regression",
  "yongji:identity-tie-regression",
];

async function cleanup() {
  await db.query(
    `delete from public.audit_logs
     where action='system_inventory_identity_majority_sync'
       and metadata->>'catalog_key'=any($1::text[])`,
    [[majorityKey,tieKey]]
  );
  await db.query("delete from public.inventory_items where item_key=any($1::text[])", [[...majorityItemKeys,...tieItemKeys]]);
}

await db.connect();
try {
  await cleanup();

  const majorityRows = [
    [majorityItemKeys[0],majorityKey,"VI minority","中文少數"],
    [majorityItemKeys[1],majorityKey,"VI majority","中文多數"],
    [majorityItemKeys[2],majorityKey,"VI majority","中文多數"],
  ];
  for (const [itemKey,catalogKey,nameVi,nameZh] of majorityRows) {
    await db.query(
      `insert into public.inventory_items(
         item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
       ) values($1,$2,$3,$4,'包','noodles',true,true)`,
      [itemKey,catalogKey,nameZh,nameVi]
    );
  }

  await db.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
     ) values
       ($1,$2,'中文左','VI left','包','noodles',true,true),
       ($3,$2,'中文右','VI right','塊','soup',false,true)`,
    [tieItemKeys[0],tieKey,tieItemKeys[1]]
  );

  await db.query(migrationSql);

  const majority = await db.query(
    `select split_part(item_key,':',1) as site,name_vi,name_zh_tw,unit,work_area,storage_only
     from public.inventory_items
     where catalog_key=$1 and active=true
     order by site`,
    [majorityKey]
  );
  assert.equal(majority.rowCount,3);
  for (const row of majority.rows) {
    assert.equal(row.name_vi,"VI majority","strict site majority did not normalize Vietnamese identity");
    assert.equal(row.name_zh_tw,"中文多數","strict site majority did not normalize Chinese identity");
    assert.equal(row.unit,"包","identity sync must not mutate unit");
    assert.equal(row.work_area,"noodles","identity sync must not mutate work area");
    assert.equal(row.storage_only,true,"identity sync must not mutate storage_only");
  }

  const tie = await db.query(
    `select split_part(item_key,':',1) as site,name_vi,name_zh_tw,unit,work_area,storage_only
     from public.inventory_items
     where catalog_key=$1 and active=true
     order by site`,
    [tieKey]
  );
  assert.equal(tie.rowCount,2);
  assert.deepEqual(tie.rows.map((row)=>row.name_vi),["VI left","VI right"],"1-1 Vietnamese tie must stay unresolved");
  assert.deepEqual(tie.rows.map((row)=>row.name_zh_tw),["中文左","中文右"],"1-1 Chinese tie must stay unresolved");
  assert.deepEqual(tie.rows.map((row)=>row.unit),["包","塊"],"operational unit variance must remain site-owned");
  assert.deepEqual(tie.rows.map((row)=>row.work_area),["noodles","soup"],"operational work-area variance must remain site-owned");
  assert.deepEqual(tie.rows.map((row)=>row.storage_only),[true,false],"storage_only variance must remain site-owned");

  const firstAudit = await db.query(
    `select metadata->>'field' as field,count(*)::int as count
     from public.audit_logs
     where action='system_inventory_identity_majority_sync'
       and metadata->>'catalog_key'=$1
     group by metadata->>'field'
     order by field`,
    [majorityKey]
  );
  assert.deepEqual(
    firstAudit.rows,
    [{field:"name_vi",count:1},{field:"name_zh_tw",count:1}],
    "majority sync must audit each changed identity field exactly once"
  );

  await db.query(migrationSql);

  const secondAudit = await db.query(
    `select count(*)::int as count
     from public.audit_logs
     where action='system_inventory_identity_majority_sync'
       and metadata->>'catalog_key'=$1`,
    [majorityKey]
  );
  assert.equal(secondAudit.rows[0]?.count,2,"idempotent rerun must not duplicate identity audit rows");

  console.log("INVENTORY_IDENTITY_MAJORITY_SYNC_REGRESSION_OK");
} finally {
  try { await cleanup(); } catch {}
  await db.end();
}
