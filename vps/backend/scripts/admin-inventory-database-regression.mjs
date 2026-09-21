import assert from "node:assert/strict";

const base=process.env.TEST_API_BASE||"http://127.0.0.1:8080";
assert(["127.0.0.1","localhost"].includes(new URL(base).hostname),"This mutation test only runs against the isolated local regression API");
async function request(path,{body,cookie="",status=200}={}) {
  const response=await fetch(`${base}${path}`,{method:body?"POST":"GET",headers:{cookie,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(data)}`);return {data,response};
}
const login=async(username)=> (await request("/api/auth/login",{body:{username,password:"KitchenTest!123"}})).response.headers.get("set-cookie").split(";")[0];
const admin=await login("yangchuadmin"),restricted=await login("managerfx");
const suffix=`dbui-${Date.now().toString(36)}`;
const post=async(path,body,status=200,cookie=admin)=>(await request(path,{cookie,body,status})).data;
const get=async(path)=>(await request(path,{cookie:admin})).data;
for(const site of ["central","fuxing","yongji"]) {
  const area={action:"save",site,code:suffix,name_vi:`Khu ${site}`,name_zh_tw:`${site}工作區`,sort_order:90,active:true,metadata:{test:suffix},createOnly:true};
  const createdArea=(await post("/api/master-data/work-areas",area)).workArea;
  assert.equal((await post("/api/master-data/work-areas",area,409)).error,"MASTER_DATA_ALREADY_EXISTS");
  const updatedArea=(await post("/api/master-data/work-areas",{...area,createOnly:false,expectedUpdatedAt:createdArea.updated_at,name_vi:`Khu riêng ${site}`})).workArea;
  assert.equal((await post("/api/master-data/work-areas",{...area,createOnly:false,expectedUpdatedAt:createdArea.updated_at},409)).error,"MASTER_DATA_STALE");
  const location={action:"save",site,code:`${site}-${suffix}`,name_vi:`Tủ ${site}`,name_zh_tw:`${site}冰箱`,kind:"storage",sort_order:90,active:true,metadata:{ui_key:suffix,storage_group:"service",test:suffix}};
  const savedLocation=(await post("/api/master-data/locations",location)).location;
  const renamedLocation=(await post("/api/master-data/locations",{...location,id:savedLocation.id,expectedUpdatedAt:savedLocation.updated_at,name_vi:`Tủ riêng ${site}`})).location;
  assert.equal((await post("/api/master-data/locations",{...location,id:savedLocation.id,expectedUpdatedAt:savedLocation.updated_at},409)).error,"MASTER_DATA_STALE");
  const item={key:`${site}:${suffix}`,catalog_key:suffix,vi:`Nguyên liệu ${site}`,zh:`${site}食材`,unit:"kg",work_area:area.code,storage_only:false,locations:[{code:location.code}]};
  let savedItem=(await post("/api/inventory/catalog/sync",{item,expectedRevision:"0",guardWorkArea:true})).item;
  assert.equal((await post("/api/inventory/catalog/sync",{item,expectedRevision:"0"},409)).error,"INVENTORY_STALE");
  const pair={itemId:savedItem.id,locationId:savedLocation.id,note:suffix};
  await post("/api/inventory/set-quantity",{...pair,quantity:3.125,expectedQuantity:0});
  assert.equal((await post("/api/inventory/set-quantity",{...pair,quantity:99,expectedQuantity:0},409)).error,"INVENTORY_STALE");
  await post("/api/inventory/set-minimum",{...pair,minimum:4.5,expectedMinimum:0});
  assert.equal((await post("/api/inventory/set-minimum",{...pair,minimum:99,expectedMinimum:0},409)).error,"INVENTORY_STALE");
  const defaults={site,catalogKey:suffix,locationCode:location.code,expectedLocationCode:""};
  await post("/api/inventory/receive-default",defaults);
  assert.equal((await post("/api/inventory/receive-default",defaults,409)).error,"INVENTORY_STALE");
  const snap=await get(`/api/inventory/${site}?includeInactive=true`);
  assert(snap.items.every((i)=>i.item_key.startsWith(`${site}:`)));
  const stock=snap.stock.find((s)=>s.item_id===savedItem.id&&s.location_id===savedLocation.id);
  assert.equal(Number(stock.quantity),3.125);assert.equal(Number(stock.minimum_quantity),4.5);
  assert.equal(snap.receiveDefaults.find((d)=>d.catalog_key===suffix).location_id,savedLocation.id);
  assert.equal(snap.items.find((i)=>i.id===savedItem.id).revision,String(savedItem.revision));
  const reread=await get(`/api/master-data/${site}?includeInactive=true`);
  assert.equal(reread.workAreas.find((a)=>a.code===area.code).name_vi,`Khu riêng ${site}`);
  assert.equal(reread.locations.find((l)=>l.id===savedLocation.id).name_vi,`Tủ riêng ${site}`);
  assert.equal(reread.locations.find((l)=>l.id===savedLocation.id).metadata.test,suffix);
  // An append from a stale association list must not prune another location.
  const spare=(await post("/api/master-data/locations",{...location,code:`${location.code}-b`,metadata:{ui_key:`${suffix}-b`,storage_group:"primary"}})).location;
  await post("/api/inventory/catalog/sync",{expectedRevision:String(savedItem.revision),appendLocations:true,item:{...item,locations:[{code:spare.code}]}});
  const withSpare=await get(`/api/inventory/${site}`);
  assert(withSpare.stock.some((s)=>s.item_id===savedItem.id&&s.location_id===savedLocation.id));
  assert(withSpare.stock.some((s)=>s.item_id===savedItem.id&&s.location_id===spare.id));
  await post("/api/master-data/locations",{action:"archive",site,id:savedLocation.id,expectedUpdatedAt:renamedLocation.updated_at},409);
  await post("/api/inventory/catalog/archive",{itemKey:item.key,expectedRevision:String(savedItem.revision)},409);
  const tx=await get(`/api/inventory/${site}/transactions?limit=250`);
  assert(tx.transactions.some((t)=>t.item_id===savedItem.id&&t.metadata?.operation==="set_minimum"));
  // Site-scoped manager must not edit another site's master records or stock.
  if(site==="yongji") {
    await post("/api/master-data/locations",{...location,id:savedLocation.id},403,restricted);
    await post("/api/inventory/set-minimum",{...pair,minimum:2},403,restricted);
  }
  await post("/api/inventory/set-quantity",{...pair,quantity:0,expectedQuantity:3.125});
  await post("/api/inventory/set-minimum",{...pair,minimum:0,expectedMinimum:4.5});
  await post("/api/inventory/receive-default",{...defaults,locationCode:"",expectedLocationCode:location.code});
  await post("/api/inventory/catalog/archive",{itemKey:item.key,expectedRevision:String(savedItem.revision)});
  assert(!(await get(`/api/inventory/${site}`)).items.some((i)=>i.id===savedItem.id));
  assert((await get(`/api/inventory/${site}?includeInactive=true`)).items.some((i)=>i.id===savedItem.id&&!i.active));
  await post("/api/master-data/locations",{action:"archive",site,id:savedLocation.id,expectedUpdatedAt:renamedLocation.updated_at});
  await post("/api/master-data/locations",{action:"archive",site,id:spare.id});
  await post("/api/master-data/work-areas",{action:"archive",site,code:area.code,expectedUpdatedAt:updatedArea.updated_at});
  console.log("ADMIN_INVENTORY_DATABASE_SITE_OK",site);
}
await request("/api/admin/super/data/inventory-products",{cookie:restricted,status:403});
console.log("ADMIN_INVENTORY_DATABASE_API_OK");
