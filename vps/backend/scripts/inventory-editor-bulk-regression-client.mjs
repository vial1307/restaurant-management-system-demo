import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const baseSource=fs.readFileSync(path.join(__dirname,"api-regression.mjs"),"utf8");
const passwordMatch=baseSource.match(/const PASSWORD = "([^"]+)";/);
assert(passwordMatch,"test fixture password not found");
const PASSWORD=passwordMatch[1];
const BASE=process.env.TEST_API_BASE || "http://127.0.0.1:8080";

async function request(pathname,{method="GET",body,cookie}={}){
  const response=await fetch(BASE+pathname,{
    method,
    headers:{
      ...(body===undefined?{}:{"content-type":"application/json"}),
      ...(cookie?{cookie}:{}),
    },
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null);
  return {response,data,cookie:response.headers.get("set-cookie")?.split(";")[0]||""};
}

async function login(username){
  const result=await request("/api/auth/login",{
    method:"POST",
    body:{username,password:PASSWORD},
  });
  assert.equal(result.response.status,200,`login failed for ${username}: ${JSON.stringify(result.data)}`);
  return result.cookie;
}

const admin=await login("yangchuadmin");
const employee=await login("employeefx");

const master=await request("/api/master-data/fuxing",{cookie:admin});
assert.equal(master.response.status,200,JSON.stringify(master.data));
assert(Array.isArray(master.data.inventoryUnits) && master.data.inventoryUnits.length>0);
const unit=master.data.inventoryUnits.find((row)=>row.code==="包") || master.data.inventoryUnits[0];
assert(unit?.code,"active inventory unit missing");

const before=await request("/api/inventory/fuxing",{cookie:admin});
assert.equal(before.response.status,200);
const storage=before.data.locations.filter((row)=>row.kind==="storage" && row.active!==false);
assert(storage.length>=2,"bulk editor regression requires two active storage locations");
const [storageA,storageB]=storage;
const workLocation=before.data.locations.find((row)=>
  row.kind==="work" &&
  (row.metadata?.work_area==="noodles" || row.metadata?.ui_key==="noodles")
);
assert(workLocation,"noodles work location missing");

const itemKey="fuxing:bulk-editor-regression";
const catalogKey="bulk-editor-regression";
const body={
  site:"fuxing",
  item:{
    key:itemKey,
    catalog_key:catalogKey,
    zh:"批次編輯回歸",
    vi:"Kiểm thử lưu hàng loạt",
    unit:unit.code,
    work_area:"noodles",
    storage_only:false,
  },
  locations:[
    {code:storageA.code,quantity:3,minimum:2},
    {code:storageB.code,quantity:4,minimum:1},
  ],
  stocktake:true,
  workMinimum:5,
  receiveDefaultLocationCode:storageA.code,
};

const created=await request("/api/inventory/editor/save",{method:"POST",cookie:admin,body});
assert.equal(created.response.status,200,JSON.stringify(created.data));
assert.equal(created.data?.ok,true);
assert.equal(created.data?.item?.item_key,itemKey);
assert.equal(created.data?.changes?.created,true);
assert.equal(Number(created.data?.changes?.quantity),2);
assert.equal(Number(created.data?.changes?.minimum),3);
assert.equal(created.data?.changes?.receiveDefault,true);
assert.equal(created.data?.receiveDefault?.location_code,storageA.code);

const snapshot=await request("/api/inventory/fuxing",{cookie:admin});
assert.equal(snapshot.response.status,200);
const item=snapshot.data.items.find((row)=>row.item_key===itemKey);
assert(item,"bulk editor item missing");
assert.equal(item.unit,unit.code);
assert.equal(item.work_area,"noodles");

function stockAt(locationId){
  return snapshot.data.stock.find((row)=>row.item_id===item.id && row.location_id===locationId);
}
assert.equal(Number(stockAt(storageA.id)?.quantity),3);
assert.equal(Number(stockAt(storageA.id)?.minimum_quantity),2);
assert.equal(Number(stockAt(storageB.id)?.quantity),4);
assert.equal(Number(stockAt(storageB.id)?.minimum_quantity),1);
assert.equal(Number(stockAt(workLocation.id)?.minimum_quantity),5);

const history1=await request("/api/inventory/fuxing/transactions?limit=500",{cookie:admin});
assert.equal(history1.response.status,200);
const itemHistory1=history1.data.transactions.filter((row)=>row.item_id===item.id);
assert.equal(
  itemHistory1.filter((row)=>row.metadata?.operation==="editor_set_quantity").length,
  2
);
assert.equal(
  itemHistory1.filter((row)=>row.metadata?.operation==="set_minimum").length,
  3
);

const noop=await request("/api/inventory/editor/save",{method:"POST",cookie:admin,body});
assert.equal(noop.response.status,200,JSON.stringify(noop.data));
assert.equal(Number(noop.data?.changes?.quantity),0);
assert.equal(Number(noop.data?.changes?.minimum),0);
assert.equal(noop.data?.changes?.receiveDefault,false);

const history2=await request("/api/inventory/fuxing/transactions?limit=500",{cookie:admin});
const itemHistory2=history2.data.transactions.filter((row)=>row.item_id===item.id);
assert.equal(itemHistory2.length,itemHistory1.length,"no-op bulk save created duplicate history");

const invalidUnit=await request("/api/inventory/editor/save",{
  method:"POST",
  cookie:admin,
  body:{...body,item:{...body.item,zh:"不可寫入",unit:"UNIT_DOES_NOT_EXIST"}},
});
assert.equal(invalidUnit.response.status,409,JSON.stringify(invalidUnit.data));
assert.equal(invalidUnit.data?.error,"INVENTORY_UNIT_NOT_FOUND");

const employeeStocktake=await request("/api/inventory/editor/save",{
  method:"POST",cookie:employee,body,
});
assert.equal(employeeStocktake.response.status,403);
assert.equal(employeeStocktake.data?.error,"STOCKTAKE_ROLE_REQUIRED");

const protectedRemoval=await request("/api/inventory/editor/save",{
  method:"POST",
  cookie:admin,
  body:{
    ...body,
    item:{...body.item,zh:"此名稱必須回滾"},
    locations:[{code:storageB.code,quantity:4,minimum:1}],
    receiveDefaultLocationCode:storageB.code,
  },
});
assert.equal(protectedRemoval.response.status,409,JSON.stringify(protectedRemoval.data));
assert.equal(protectedRemoval.data?.error,"LOCATION_HAS_STOCK");

const afterRollback=await request("/api/inventory/fuxing",{cookie:admin});
const rolledBackItem=afterRollback.data.items.find((row)=>row.id===item.id);
assert.equal(rolledBackItem?.name_zh_tw,"批次編輯回歸");
const protectedStock=afterRollback.data.stock.find(
  (row)=>row.item_id===item.id && row.location_id===storageA.id
);
assert.equal(Number(protectedStock?.quantity),3);
assert.equal(Number(protectedStock?.minimum_quantity),2);
const defaultAfterRollback=afterRollback.data.receiveDefaults.find(
  (row)=>row.catalog_key===catalogKey
);
assert.equal(defaultAfterRollback?.location_code,storageA.code);

console.log("INVENTORY_EDITOR_BULK_REGRESSION_OK");
