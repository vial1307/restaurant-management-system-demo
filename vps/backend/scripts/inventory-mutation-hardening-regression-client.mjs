import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseSource = fs.readFileSync(path.join(__dirname, "api-regression.mjs"), "utf8");
const passwordMatch = baseSource.match(/const PASSWORD = "([^"]+)";/);
assert(passwordMatch, "test fixture password not found");
const PASSWORD = passwordMatch[1];
const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";

const CATALOGS = [
  "catalog-location-failclosed-regression",
  "catalog-duplicate-active-regression",
  "direct-transfer-concurrency-regression",
  "storage-relocation-concurrency-regression",
];

async function request(pathname,{method="GET",body,cookie}={}){
  const response=await fetch(BASE+pathname,{
    method,
    headers:{
      ...(body===undefined?{}:{"content-type":"application/json"}),
      ...(cookie?{cookie}:{}),
    },
    body:body===undefined?undefined:JSON.stringify(body),
  });
  let data=null;
  try{ data=await response.json(); }catch{}
  return {response,data,cookie:response.headers.get("set-cookie")?.split(";")[0]||""};
}

async function login(username){
  const result=await request("/api/auth/login",{
    method:"POST",
    body:{username,password:PASSWORD},
  });
  assert.equal(result.response.status,200,`login failed: ${JSON.stringify(result.data)}`);
  return result.cookie;
}

const db=new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || "kitchen_test",
  user:process.env.POSTGRES_USER || "kitchen_test",
  password:process.env.POSTGRES_PASSWORD || "kitchen_test",
});

async function cleanup(){
  await db.query(
    "delete from public.inventory_receive_defaults where catalog_key=any($1::text[])",
    [CATALOGS]
  );
  await db.query(
    "delete from public.inventory_transactions where item_id in (select id from public.inventory_items where catalog_key=any($1::text[]))",
    [CATALOGS]
  );
  await db.query(
    "delete from public.inventory_stock where item_id in (select id from public.inventory_items where catalog_key=any($1::text[]))",
    [CATALOGS]
  );
  await db.query(
    "delete from public.audit_logs where metadata->>'catalog_key'=any($1::text[]) or metadata->>'catalogKey'=any($1::text[])",
    [CATALOGS]
  );
  await db.query(
    "delete from public.inventory_items where catalog_key=any($1::text[])",
    [CATALOGS]
  );
}

await db.connect();
try{
  await cleanup();
  const admin=await login("yangchuadmin");

  const fx=(await request("/api/inventory/fuxing",{cookie:admin})).data;
  const yj=(await request("/api/inventory/yongji",{cookie:admin})).data;
  const fxStorages=fx.locations.filter((row)=>row.kind==="storage" && row.active!==false);
  const yjStorages=yj.locations.filter((row)=>row.kind==="storage" && row.active!==false);
  assert(fxStorages.length>=2,"Fuxing requires two storage locations for mutation hardening regression");
  assert(yjStorages.length>=1,"Yongji storage fixture missing");

  const fxAreas=new Set(
    fx.locations.filter((row)=>row.kind==="work" && row.active!==false).map((row)=>row.metadata?.work_area).filter(Boolean)
  );
  const yjAreas=new Set(
    yj.locations.filter((row)=>row.kind==="work" && row.active!==false).map((row)=>row.metadata?.work_area).filter(Boolean)
  );
  const commonArea=[...fxAreas].find((area)=>yjAreas.has(area));
  assert(commonArea,"Fuxing/Yongji have no common Work Area fixture");

  // Invalid catalog locations must fail and roll back the item create instead
  // of being silently skipped.
  const invalidCatalog=CATALOGS[0];
  const missingLocation=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${invalidCatalog}`,
      catalog_key:invalidCatalog,
      zh:"無效儲位測試",
      vi:"Kiểm thử vị trí không hợp lệ",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:"does-not-exist-regression"}],
    }},
  });
  assert.equal(missingLocation.response.status,404,JSON.stringify(missingLocation.data));
  assert.equal(missingLocation.data?.error,"CATALOG_LOCATION_NOT_FOUND");

  const crossSiteLocation=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${invalidCatalog}`,
      catalog_key:invalidCatalog,
      zh:"跨店儲位測試",
      vi:"Kiểm thử vị trí khác chi nhánh",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:yjStorages[0].code}],
    }},
  });
  assert.equal(crossSiteLocation.response.status,400,JSON.stringify(crossSiteLocation.data));
  assert.equal(crossSiteLocation.data?.error,"CATALOG_LOCATION_SITE_MISMATCH");

  const rolledBack=await db.query(
    "select count(*)::int as count from public.inventory_items where catalog_key=$1",
    [invalidCatalog]
  );
  assert.equal(rolledBack.rows[0].count,0,"invalid catalog location left a partially-created item");

  // One active catalog identity per site is now a PostgreSQL unique invariant.
  const duplicateCatalog=CATALOGS[1];
  const firstDuplicate=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${duplicateCatalog}-a`,
      catalog_key:duplicateCatalog,
      zh:"重複品項 A",
      vi:"Mục trùng A",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:fxStorages[0].code}],
    }},
  });
  assert.equal(firstDuplicate.response.status,200,JSON.stringify(firstDuplicate.data));

  const secondDuplicate=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${duplicateCatalog}-b`,
      catalog_key:duplicateCatalog,
      zh:"重複品項 B",
      vi:"Mục trùng B",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:fxStorages[0].code}],
    }},
  });
  assert.equal(secondDuplicate.response.status,409,JSON.stringify(secondDuplicate.data));
  assert.equal(secondDuplicate.data?.error,"CATALOG_CONFLICT");
  const duplicateCount=await db.query(
    `select count(*)::int as count
     from public.inventory_items
     where active=true
       and split_part(item_key,':',1)='fuxing'
       and catalog_key=$1`,
    [duplicateCatalog]
  );
  assert.equal(duplicateCount.rows[0].count,1,"database allowed duplicate active catalog identity in one site");

  // Concurrent cross-site transfers to a catalog that does not yet exist at
  // the destination must serialize destination creation rather than racing on
  // item_key/catalog identity.
  const directCatalog=CATALOGS[2];
  const directSource=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${directCatalog}`,
      catalog_key:directCatalog,
      zh:"並行出貨測試",
      vi:"Kiểm thử xuất hàng đồng thời",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:fxStorages[0].code}],
    }},
  });
  assert.equal(directSource.response.status,200,JSON.stringify(directSource.data));
  const sourceItemId=directSource.data.item.id;
  const sourceSeed=await request("/api/inventory/set-quantity",{
    method:"POST",cookie:admin,
    body:{itemId:sourceItemId,locationId:fxStorages[0].id,quantity:2,note:"direct transfer concurrency seed"},
  });
  assert.equal(sourceSeed.response.status,200);

  const transferBody={
    itemId:sourceItemId,
    sourceLocationId:fxStorages[0].id,
    destinationLocationId:yjStorages[0].id,
    quantity:1,
    note:"direct transfer concurrency regression",
  };
  const concurrentTransfers=await Promise.all([
    request("/api/inventory/direct-transfer",{method:"POST",cookie:admin,body:transferBody}),
    request("/api/inventory/direct-transfer",{method:"POST",cookie:admin,body:transferBody}),
  ]);
  for(const result of concurrentTransfers){
    assert.equal(result.response.status,200,`concurrent direct transfer failed: ${JSON.stringify(result.data)}`);
  }

  const afterDirectFx=(await request("/api/inventory/fuxing",{cookie:admin})).data;
  const afterDirectYj=(await request("/api/inventory/yongji",{cookie:admin})).data;
  const sourceStock=afterDirectFx.stock.find(
    (row)=>row.item_id===sourceItemId && row.location_id===fxStorages[0].id
  );
  assert.equal(Number(sourceStock?.quantity),0,"concurrent direct transfer did not consume exactly two source units");
  const destinationItems=afterDirectYj.items.filter((row)=>row.catalog_key===directCatalog && row.active!==false);
  assert.equal(destinationItems.length,1,"concurrent transfer created duplicate destination catalog items");
  const destinationStock=afterDirectYj.stock.find(
    (row)=>row.item_id===destinationItems[0].id && row.location_id===yjStorages[0].id
  );
  assert.equal(Number(destinationStock?.quantity),2,"concurrent transfer destination quantity is incorrect");

  // Opposite storage relocations on one item are serialized by item advisory
  // lock, preventing deadlock and preserving the total/minimum.
  const storageCatalog=CATALOGS[3];
  const storageItem=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin,
    body:{item:{
      key:`fuxing:${storageCatalog}`,
      catalog_key:storageCatalog,
      zh:"並行儲位搬移測試",
      vi:"Kiểm thử chuyển vị trí đồng thời",
      unit:"包",
      work_area:commonArea,
      storage_only:false,
      locations:[{code:fxStorages[0].code},{code:fxStorages[1].code}],
    }},
  });
  assert.equal(storageItem.response.status,200,JSON.stringify(storageItem.data));
  const storageItemId=storageItem.data.item.id;
  for(const [location,quantity,minimum] of [
    [fxStorages[0],3,1],
    [fxStorages[1],4,2],
  ]){
    const q=await request("/api/inventory/set-quantity",{
      method:"POST",cookie:admin,
      body:{itemId:storageItemId,locationId:location.id,quantity},
    });
    assert.equal(q.response.status,200);
    const m=await request("/api/inventory/set-minimum",{
      method:"POST",cookie:admin,
      body:{itemId:storageItemId,locationId:location.id,minimum},
    });
    assert.equal(m.response.status,200);
  }

  const concurrentRelocations=await Promise.all([
    request("/api/inventory/relocate-storage",{
      method:"POST",cookie:admin,
      body:{
        itemId:storageItemId,
        sourceLocationId:fxStorages[0].id,
        destinationLocationId:fxStorages[1].id,
        note:"opposite relocation A",
      },
    }),
    request("/api/inventory/relocate-storage",{
      method:"POST",cookie:admin,
      body:{
        itemId:storageItemId,
        sourceLocationId:fxStorages[1].id,
        destinationLocationId:fxStorages[0].id,
        note:"opposite relocation B",
      },
    }),
  ]);
  for(const result of concurrentRelocations){
    assert.equal(result.response.status,200,`concurrent storage relocation failed: ${JSON.stringify(result.data)}`);
  }

  const afterRelocation=(await request("/api/inventory/fuxing",{cookie:admin})).data;
  const finalStorageRows=afterRelocation.stock.filter(
    (row)=>row.item_id===storageItemId && [fxStorages[0].id,fxStorages[1].id].includes(row.location_id)
  );
  assert.equal(finalStorageRows.length,1,"opposite relocations left duplicate storage rows");
  assert.equal(Number(finalStorageRows[0].quantity),7,"opposite relocations changed total physical quantity");
  assert.equal(Number(finalStorageRows[0].minimum_quantity),2,"opposite relocations did not preserve maximum minimum");

  console.log("INVENTORY_MUTATION_HARDENING_API_OK");
} finally {
  try{ await cleanup(); }catch{}
  await db.end();
}
