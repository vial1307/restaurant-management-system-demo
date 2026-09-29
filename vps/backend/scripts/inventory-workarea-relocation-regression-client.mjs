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
const CATALOG_KEY = "shared-workarea-relocate-regression";
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
  assert(areas.length>=2,"shared Work Area relocation regression needs two common work areas");
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
    const itemKey=`${site}:${CATALOG_KEY}`;
    const locations=[
      {code:fixtures[site].storage.code},
      ...(site==="central" ? [{code:fixtures[site].sourceWork.code}] : []),
    ];
    const saved=await request("/api/inventory/catalog/sync",{
      method:"POST",
      cookie:admin,
      body:{item:{
        key:itemKey,
        catalog_key:CATALOG_KEY,
        zh:"共享工作區搬移測試",
        vi:"Kiểm thử chuyển khu dùng chung",
        unit:"包",
        work_area:sourceArea,
        storage_only:false,
        locations,
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
    assert(workRow,`${site} source Work Area projection missing`);

    const quantity=await request("/api/inventory/set-quantity",{
      method:"POST",cookie:admin,
      body:{
        itemId:item.id,
        locationId:fixtures[site].sourceWork.id,
        quantity:quantities[site],
        note:"shared Work Area relocation quantity seed",
      },
    });
    assert.equal(quantity.response.status,200,`${site} quantity seed failed`);

    const minimum=await request("/api/inventory/set-minimum",{
      method:"POST",cookie:admin,
      body:{
        itemId:item.id,
        locationId:fixtures[site].sourceWork.id,
        minimum:minimums[site],
        note:"shared Work Area relocation minimum seed",
      },
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
      note:"shared Work Area atomic regression",
    },
  });
  assert.equal(
    relocated.response.status,200,
    `shared Work Area relocation failed: ${JSON.stringify(relocated.data)}`
  );
  assert.equal(relocated.data?.ok,true);
  assert.equal(relocated.data?.work_area,destinationArea);
  assert.equal(Number(relocated.data?.coordinated_items),3);
  assert.deepEqual(
    [...(relocated.data?.coordinated_sites || [])].sort(),
    [...SITES].sort(),
    "shared Work Area relocation did not coordinate every catalog site"
  );

  for(const site of SITES){
    const snapshot=await request(`/api/inventory/${site}`,{cookie:admin});
    const item=snapshot.data.items.find((row)=>row.id===itemIds[site]);
    assert(item,`${site} item missing after relocation`);
    assert.equal(item.work_area,destinationArea,`${site} Work Area did not move atomically`);

    const workRows=snapshot.data.stock
      .filter((row)=>row.item_id===item.id)
      .map((row)=>({
        stock:row,
        location:snapshot.data.locations.find((location)=>location.id===row.location_id),
      }))
      .filter((entry)=>entry.location?.kind==="work");
    assert.equal(workRows.length,1,`${site} has duplicate/missing work projection after relocation`);
    assert.equal(workRows[0].location.metadata?.work_area,destinationArea);
    assert.equal(Number(workRows[0].stock.quantity),quantities[site],`${site} quantity changed during relocation`);
    assert.equal(Number(workRows[0].stock.minimum_quantity),minimums[site],`${site} minimum changed during relocation`);
  }

  const audits=await db.query(
    `select action,site,entity_id,metadata
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
    2,
    "peer Work Area relocation audits missing"
  );

  const drift=await db.query(
    `with central_catalog as (
       select i.catalog_key,min(i.work_area) as work_area
       from public.inventory_items i
       join public.sites s
         on s.code=split_part(i.item_key,':',1)
        and s.active=true
        and coalesce(s.metadata->>'inventory_mode','')='central'
       where i.active=true and i.catalog_key=$1
       group by i.catalog_key
       having count(distinct i.work_area)=1
     )
     select count(*)::int as count
     from public.inventory_items i
     join public.sites s
       on s.code=split_part(i.item_key,':',1)
      and s.active=true
      and coalesce(s.metadata->>'inventory_mode','')='branch'
     join central_catalog c using(catalog_key)
     where i.active=true
       and i.catalog_key=$1
       and i.work_area is distinct from c.work_area`,
    [CATALOG_KEY]
  );
  assert.equal(drift.rows[0]?.count,0,"shared catalog Work Area drift remains after API relocation");

  console.log("INVENTORY_SHARED_WORKAREA_RELOCATION_API_OK");
} finally {
  try{ await cleanup(); }catch{}
  await db.end();
}
