import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseSource = fs.readFileSync(path.join(__dirname, "api-regression.mjs"), "utf8");
const passwordMatch = baseSource.match(/const PASSWORD = "([^"]+)";/);
assert(passwordMatch, "test fixture password not found in api-regression.mjs");
const PASSWORD = passwordMatch[1];
const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const CATALOG_KEY = "site-workarea-relocate-regression";
const SITES = ["central","fuxing","yongji"];

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
  assert(result.cookie,"missing login cookie");
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
    "delete from public.inventory_receive_defaults where catalog_key=$1",
    [CATALOG_KEY]
  );
  await db.query(
    "delete from public.inventory_transactions where item_id in (select id from public.inventory_items where catalog_key=$1)",
    [CATALOG_KEY]
  );
  await db.query(
    "delete from public.inventory_stock where item_id in (select id from public.inventory_items where catalog_key=$1)",
    [CATALOG_KEY]
  );
  await db.query(
    "delete from public.audit_logs where metadata->>'catalog_key'=$1 or metadata->>'catalogKey'=$1",
    [CATALOG_KEY]
  );
  await db.query(
    "delete from public.inventory_items where catalog_key=$1",
    [CATALOG_KEY]
  );
}

await db.connect();
try{
  await cleanup();
  const schema=await db.query("select max(version) as version from public.schema_migrations");
  assert.ok(Number(schema.rows[0]?.version)>=32, "schema 032+ must be active");

  const admin=await login("yangchuadmin");

  const before={};
  for(const site of SITES){
    const snapshot=await request(`/api/inventory/${site}`,{cookie:admin});
    assert.equal(snapshot.response.status,200,`${site} snapshot failed`);
    before[site]=snapshot.data;
  }

  const commonAreas=SITES
    .map((site)=>new Set(
      before[site].locations
        .filter((row)=>row.kind==="work" && row.active!==false && row.metadata?.work_area)
        .map((row)=>String(row.metadata.work_area))
    ))
    .reduce((left,right)=>new Set([...left].filter((value)=>right.has(value))));
  const areas=[...commonAreas].sort();
  assert(areas.length>=2,"site-scoped Work Area regression needs two common fixture areas");
  const [sourceArea,destinationArea]=areas;

  const fixtures={};
  for(const site of SITES){
    const storage=before[site].locations.find((row)=>row.kind==="storage" && row.active!==false);
    const sourceWork=before[site].locations.find(
      (row)=>row.kind==="work" && row.metadata?.work_area===sourceArea
    );
    const destinationWork=before[site].locations.find(
      (row)=>row.kind==="work" && row.metadata?.work_area===destinationArea
    );
    assert(storage && sourceWork && destinationWork,`${site} fixture locations missing`);
    fixtures[site]={storage,sourceWork,destinationWork};
  }

  for(const site of SITES){
    const saved=await request("/api/inventory/catalog/sync",{
      method:"POST",
      cookie:admin,
      body:{item:{
        key:`${site}:${CATALOG_KEY}`,
        catalog_key:CATALOG_KEY,
        zh:"站點工作區搬移測試",
        vi:"Kiểm thử chuyển Work Area theo chi nhánh",
        unit:"包",
        work_area:sourceArea,
        storage_only:site!=="central",
        // Catalog locations are storage-only. Branch Work stock is projected
        // automatically from work_area; Central remains a metadata peer here.
        locations:[{code:fixtures[site].storage.code}],
      }},
    });
    assert.equal(saved.response.status,200,`${site} catalog create failed: ${JSON.stringify(saved.data)}`);
  }

  const quantities={central:2,fuxing:7,yongji:5};
  const minimums={central:1,fuxing:3,yongji:2};
  const itemIds={};

  for(const site of SITES){
    const snapshot=await request(`/api/inventory/${site}`,{cookie:admin});
    const item=snapshot.data.items.find((row)=>row.catalog_key===CATALOG_KEY);
    assert(item,`${site} regression item missing after create`);
    itemIds[site]=item.id;

    const workRow=snapshot.data.stock.find(
      (row)=>row.item_id===item.id && row.location_id===fixtures[site].sourceWork.id
    );
    if(site==="central") {
      assert.equal(workRow,undefined,"Central catalog sync must not treat Work Location as an explicit storage association");
      continue;
    }
    assert(workRow,`${site} source Work Area projection missing`);

    const quantity=await request("/api/inventory/set-quantity",{
      method:"POST",cookie:admin,
      body:{itemId:item.id,locationId:fixtures[site].sourceWork.id,quantity:quantities[site]},
    });
    assert.equal(quantity.response.status,200,`${site} quantity seed failed`);

    const minimum=await request("/api/inventory/set-minimum",{
      method:"POST",cookie:admin,
      body:{itemId:item.id,locationId:fixtures[site].sourceWork.id,minimum:minimums[site]},
    });
    assert.equal(minimum.response.status,200,`${site} minimum seed failed`);
  }

  const relocated=await request("/api/inventory/relocate-work-area",{
    method:"POST",
    cookie:admin,
    body:{
      itemId:itemIds.fuxing,
      sourceLocationId:fixtures.fuxing.sourceWork.id,
      destinationLocationId:fixtures.fuxing.destinationWork.id,
      note:"site-scoped Work Area regression",
    },
  });
  assert.equal(
    relocated.response.status,200,
    `site-scoped Work Area relocation failed: ${JSON.stringify(relocated.data)}`
  );
  assert.equal(relocated.data?.ok,true);
  assert.equal(relocated.data?.work_area,destinationArea);
  assert.equal(Number(relocated.data?.coordinated_items),1);
  assert.deepEqual(
    relocated.data?.coordinated_sites,
    ["fuxing"],
    "branch Work Area relocation must stay inside the edited site"
  );

  for(const site of SITES){
    const snapshot=await request(`/api/inventory/${site}`,{cookie:admin});
    const item=snapshot.data.items.find((row)=>row.id===itemIds[site]);
    assert(item,`${site} item missing after relocation`);

    const expectedArea=site==="fuxing" ? destinationArea : sourceArea;
    assert.equal(
      item.work_area,
      expectedArea,
      `${site} Work Area changed outside the site-scoped edit`
    );

    const workRows=snapshot.data.stock
      .filter((row)=>row.item_id===item.id)
      .map((row)=>({
        stock:row,
        location:snapshot.data.locations.find((location)=>location.id===row.location_id),
      }))
      .filter((entry)=>entry.location?.kind==="work");
    if(site==="central") {
      assert.equal(workRows.length,0,"Central metadata peer unexpectedly gained a branch-style Work projection");
    } else {
      assert.equal(workRows.length,1,`${site} has duplicate/missing Work Area projection`);
      assert.equal(workRows[0].location.metadata?.work_area,expectedArea);
      assert.equal(Number(workRows[0].stock.quantity),quantities[site],`${site} quantity changed during relocation`);
      assert.equal(Number(workRows[0].stock.minimum_quantity),minimums[site],`${site} minimum changed during relocation`);
    }
  }

  const audits=await db.query(
    `select action,site,entity_id
     from public.audit_logs
     where metadata->>'catalog_key'=$1
       and action in ('inventory_work_area_relocate','inventory_work_area_relocate_peer')
     order by action,site`,
    [CATALOG_KEY]
  );
  assert.equal(
    audits.rows.filter((row)=>row.action==="inventory_work_area_relocate").length,
    1,
    "initiating Work Area relocation audit missing"
  );
  assert.equal(
    audits.rows.filter((row)=>row.action==="inventory_work_area_relocate_peer").length,
    0,
    "site-scoped Work Area edit must not generate peer-site mutations"
  );

  const variants=await db.query(
    `select count(distinct work_area)::int as count
     from public.inventory_items
     where active=true and catalog_key=$1`,
    [CATALOG_KEY]
  );
  assert.equal(
    variants.rows[0]?.count,
    2,
    "shared product identity must be allowed to use different Work Areas at different sites"
  );

  console.log("INVENTORY_SITE_SCOPED_WORKAREA_API_OK");
} finally {
  try{ await cleanup(); }catch{}
  await db.end();
}
