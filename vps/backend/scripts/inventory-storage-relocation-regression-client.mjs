import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";

async function request(path,{method="GET",body,cookie}={}){
  const response=await fetch(BASE+path,{
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
  const result=await request("/api/auth/login",{method:"POST",body:{username,password:PASSWORD}});
  assert.equal(result.response.status,200);
  assert(result.cookie);
  return result.cookie;
}

const admin=await login("yangchuadmin");
const snapshot=await request("/api/inventory/fuxing",{cookie:admin});
assert.equal(snapshot.response.status,200);
const storages=snapshot.data.locations.filter((row)=>row.kind==="storage");
assert(storages.length>=2,"relocation regression needs at least two Fuxing storage locations");

const source=storages[0];
const destination=storages[1];
const itemKey="fuxing:relocate-regression";
const catalogKey="relocate-regression";

const seeded=await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:admin,
  body:{item:{
    key:itemKey,
    catalog_key:catalogKey,
    zh:"儲位移動測試",
    vi:"Kiểm thử chuyển vị trí",
    unit:"包",
    work_area:"noodles",
    storage_only:false,
    locations:[
      {code:source.code,quantity:5,minimum:2},
      {code:destination.code,quantity:3,minimum:1},
    ],
  }},
});
assert.equal(seeded.response.status,200);
const itemId=seeded.data.item.id;

const receive=await request("/api/inventory/receive-default",{
  method:"POST",cookie:admin,
  body:{site:"fuxing",catalogKey,locationCode:source.code},
});
assert.equal(receive.response.status,200);

const relocated=await request("/api/inventory/relocate-storage",{
  method:"POST",cookie:admin,
  body:{
    itemId,
    sourceLocationId:source.id,
    destinationLocationId:destination.id,
    note:"庫存儲位移動 regression",
  },
});
assert.equal(relocated.response.status,200,JSON.stringify(relocated.data));
assert.equal(relocated.data.ok,true);
assert.equal(Number(relocated.data.source_before),5);
assert.equal(Number(relocated.data.source_after),0);
assert.equal(Number(relocated.data.destination_before),3);
assert.equal(Number(relocated.data.destination_after),8);
assert.equal(Number(relocated.data.destination_minimum_after),2);
assert.equal(relocated.data.receive_default_moved,true);

const after=await request("/api/inventory/fuxing",{cookie:admin});
assert.equal(after.response.status,200);
const sourceStock=after.data.stock.find((row)=>row.item_id===itemId&&row.location_id===source.id);
const destinationStock=after.data.stock.find((row)=>row.item_id===itemId&&row.location_id===destination.id);
assert.equal(sourceStock,undefined,"source storage row must be removed after full relocation");
assert(destinationStock,"destination storage row missing after relocation");
assert.equal(Number(destinationStock.quantity),8);
assert.equal(Number(destinationStock.minimum_quantity),2);

const defaultRow=after.data.receiveDefaults.find((row)=>row.catalog_key===catalogKey);
assert(defaultRow,"receive default disappeared after relocation");
assert.equal(defaultRow.location_id,destination.id);
assert.equal(defaultRow.location_code,destination.code);

const yj=await request("/api/inventory/yongji",{cookie:admin});
assert.equal(yj.response.status,200);
assert(!yj.data.items.some((item)=>item.item_key===itemKey),"Fuxing relocated item leaked into Yongji item list");
assert(!yj.data.stock.some((row)=>row.item_id===itemId),"Fuxing relocated stock leaked into Yongji snapshot");

console.log("INVENTORY_STORAGE_RELOCATION_OK");
