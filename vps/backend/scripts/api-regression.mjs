import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const MODULES = ["dashboard","inventory","procurement","reservations","preparation","menu","sop","skills","attendance","schedule","reports","remote","settings"];

async function request(path, { method="GET", body, cookie, headers={} } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function login(username, password = PASSWORD) {
  const result = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password },
  });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `missing session cookie for ${username}`);
  return { cookie:result.cookie, user:result.data.user };
}

async function inventory(cookie, site) {
  return request(`/api/inventory/${site}`, { cookie });
}

const health = await request("/api/health");
assert.equal(health.response.status,200);
assert.equal(health.data.schema,"005");

const admin = await login("yangchuadmin");
assert.equal(admin.user.role,"admin");
assert.equal(admin.user.location,"all");
for (const key of MODULES) {
  assert.equal(admin.user.permissions[key]?.view,true,`admin view missing ${key}`);
  assert.equal(admin.user.permissions[key]?.edit,true,`admin edit missing ${key}`);
}

const manager = await login("managerfx");
const managerYj = await login("manageryj");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const parttime = await login("parttimefx");
const central = await login("centralreg");
const remoteOnly = await login("remoteonly");

const statePayload = {
  settings:{reservationBuffer:3},
  reservations:{records:{"2026-09-04":{reservation:{lunchTables:5,dinnerTables:9,remaining:{}},riceRemaining:700}}},
  preparation:{records:{"2026-09-04":{completedTasks:{"task-a":true},customTasks:[]}},jobCatalog:[]},
  attendance:{attendance:[],payroll:{overtimeRate:1.34}},
  shared:{staff:[{id:"staff-a",name:"A",role:"employee",area:"noodles",hourlyRate:200,active:true,pin:""}]},
};
const adminStateSave = await request("/api/business-state/fuxing",{
  method:"POST",cookie:admin.cookie,body:{modules:statePayload}
});
assert.equal(adminStateSave.response.status,200);
assert.equal(adminStateSave.data.revision,1);
assert.deepEqual(new Set(adminStateSave.data.savedModules),new Set(Object.keys(statePayload)));
const adminStateRead = await request("/api/business-state/fuxing",{cookie:admin.cookie});
assert.equal(adminStateRead.response.status,200);
assert.equal(adminStateRead.data.modules.settings.reservationBuffer,3);
assert.equal(adminStateRead.data.modules.reservations.records["2026-09-04"].riceRemaining,700);

const employeeStateRead = await request("/api/business-state/fuxing",{cookie:employee.cookie});
assert.equal(employeeStateRead.response.status,200);
assert.equal(employeeStateRead.data.modules.settings,undefined,"employee must not read settings state");
assert.equal(employeeStateRead.data.modules.attendance.payroll.overtimeRate,1.34);
const employeeStateSave = await request("/api/business-state/fuxing",{
  method:"POST",cookie:employee.cookie,
  body:{modules:{settings:{reservationBuffer:99},attendance:{attendance:[{id:"clock-test"}],payroll:{overtimeRate:1.5}}}}
});
assert.equal(employeeStateSave.response.status,200);
assert.deepEqual(employeeStateSave.data.savedModules,["attendance"]);
const protectedStateRead = await request("/api/business-state/fuxing",{cookie:admin.cookie});
assert.equal(protectedStateRead.data.modules.settings.reservationBuffer,3,"unauthorized settings write was accepted");
assert.equal(protectedStateRead.data.modules.attendance.payroll.overtimeRate,1.5);
assert.equal((await request("/api/business-state/yongji",{cookie:employee.cookie})).response.status,403);
assert.equal((await request("/api/business-state/central",{
  method:"POST",cookie:central.cookie,body:{modules:{settings:{reservationBuffer:9}}}
})).response.status,403);

const remoteStateSave = await request("/api/business-state/fuxing",{
  method:"POST",cookie:remoteOnly.cookie,
  body:{modules:{
    preparation:{jobCatalog:[{id:"wrong-module"}]},
    shared:{staff:[{id:"unauthorized-staff"}]},
    remote:{jobCatalog:[{id:"remote-job",label:"遠端工作",labelVi:"Việc từ xa",active:true}]},
  }}
});
assert.equal(remoteStateSave.response.status,200);
assert.deepEqual(remoteStateSave.data.savedModules,["remote"]);
const remoteStateRead = await request("/api/business-state/fuxing",{cookie:remoteOnly.cookie});
assert.deepEqual(remoteStateRead.data.modules.remote.jobCatalog.map((job)=>job.id),["remote-job"]);
assert.equal(remoteStateRead.data.modules.preparation,undefined,"remote-only user read preparation state");
assert.equal(remoteStateRead.data.modules.shared,undefined,"remote-only user read staff state");

const preferenceUpdate = await request("/api/auth/preferences", {
  method:"POST",cookie:manager.cookie,body:{preferredLanguage:"zh-TW"}
});
assert.equal(preferenceUpdate.response.status,200);
assert.equal(preferenceUpdate.data.user.preferredLanguage,"zh-TW");
assert.equal((await request("/api/auth/me",{cookie:manager.cookie})).data.user.preferredLanguage,"zh-TW");
assert.equal((await request("/api/auth/preferences",{
  method:"POST",body:{preferredLanguage:"vi"}
})).response.status,401);

for (const site of ["fuxing","yongji","central"]) {
  assert.equal((await inventory(admin.cookie,site)).response.status,200,`admin cannot view ${site}`);
}
assert.equal((await inventory(manager.cookie,"fuxing")).response.status,200);
assert.equal((await inventory(manager.cookie,"yongji")).response.status,403);
assert.equal((await inventory(central.cookie,"central")).response.status,200);
assert.equal((await inventory(central.cookie,"fuxing")).response.status,403);

const centralDestinations = await request("/api/inventory/destinations?source=central&sites=fuxing,yongji",{cookie:central.cookie});
assert.equal(centralDestinations.response.status,200);
assert(centralDestinations.data.locations.some((entry)=>entry.site==="fuxing"));
assert(centralDestinations.data.locations.some((entry)=>entry.site==="yongji"));
assert(centralDestinations.data.catalog.some((entry)=>entry.site==="fuxing" && entry.catalogKey==="beef"));
assert.equal((await request("/api/inventory/destinations?source=fuxing&sites=yongji",{cookie:central.cookie})).response.status,403);
assert.equal((await request("/api/inventory/destinations?source=fuxing&sites=yongji",{cookie:parttime.cookie})).response.status,403);

const adminUsers = await request("/api/admin/users",{cookie:admin.cookie});
assert.equal(adminUsers.response.status,200);
assert.equal((await request("/api/admin/users",{cookie:manager.cookie})).response.status,403);

const fuxingData = (await inventory(admin.cookie,"fuxing")).data;
const yongjiData = (await inventory(admin.cookie,"yongji")).data;
const beefFx = fuxingData.items.find((item) => item.catalog_key === "beef");
const tofuFx = fuxingData.items.find((item) => item.catalog_key === "tofu");
const beefYj = yongjiData.items.find((item) => item.catalog_key === "beef");
const tofuYj = yongjiData.items.find((item) => item.catalog_key === "tofu");
const fxFreezer = fuxingData.locations.find((loc) => loc.code === "fuxing-freezer");
const fxFour = fuxingData.locations.find((loc) => loc.code === "fuxing-four");
const fxWorkNoodles = fuxingData.locations.find((loc) => loc.code === "fuxing-work-noodles");
const fxWorkMeat = fuxingData.locations.find((loc) => loc.code === "fuxing-work-meat");
const yjFreezer = yongjiData.locations.find((loc) => loc.code === "yongji-freezer");
const yjFour = yongjiData.locations.find((loc) => loc.code === "yongji-four");
const yjWorkNoodles = yongjiData.locations.find((loc) => loc.code === "yongji-work-noodles");
const yjWorkMeat = yongjiData.locations.find((loc) => loc.code === "yongji-work-meat");
assert(beefFx && tofuFx && beefYj && tofuYj && fxFreezer && fxFour && fxWorkNoodles && fxWorkMeat && yjFreezer && yjFour && yjWorkNoodles && yjWorkMeat);

assert.equal((await request("/api/inventory/fuxing/transactions",{cookie:manager.cookie})).response.status,403);
assert.equal((await request("/api/inventory/fuxing/transactions",{cookie:admin.cookie})).response.status,200);

const receiveAuditCatalogKey="receive-default-audit-regression";
const receiveAuditEntityId=`fuxing:${receiveAuditCatalogKey}`;
const receiveAuditItem=await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:admin.cookie,
  body:{item:{
    key:receiveAuditEntityId,
    catalog_key:receiveAuditCatalogKey,
    zh:"收貨儲位稽核測試",
    vi:"Kiểm thử audit vị trí nhận hàng",
    unit:"包",work_area:"noodles",storage_only:true,
    locations:[
      {code:fxFreezer.code,quantity:0,minimum:0},
      {code:fxFour.code,quantity:0,minimum:0},
    ],
  }}
});
assert.equal(receiveAuditItem.response.status,200);

const receiveAuditCreate=await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:receiveAuditCatalogKey,locationCode:fxFreezer.code}
});
assert.equal(receiveAuditCreate.response.status,200);
assert.equal(receiveAuditCreate.data?.changed,true);
assert.equal(receiveAuditCreate.data?.deleted,false);
assert(receiveAuditCreate.data?.audit?.id);

const receiveAuditNoop=await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:receiveAuditCatalogKey,locationCode:fxFreezer.code}
});
assert.equal(receiveAuditNoop.response.status,200);
assert.equal(receiveAuditNoop.data?.changed,false);
assert.equal(receiveAuditNoop.data?.audit,null);

const receiveAuditUpdate=await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:receiveAuditCatalogKey,locationCode:fxFour.code}
});
assert.equal(receiveAuditUpdate.response.status,200);
assert.equal(receiveAuditUpdate.data?.changed,true);
assert.equal(receiveAuditUpdate.data?.deleted,false);

const receiveAuditDelete=await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:receiveAuditCatalogKey,locationCode:""}
});
assert.equal(receiveAuditDelete.response.status,200);
assert.equal(receiveAuditDelete.data?.changed,true);
assert.equal(receiveAuditDelete.data?.deleted,true);

const receiveAuditDeleteNoop=await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:receiveAuditCatalogKey,locationCode:""}
});
assert.equal(receiveAuditDeleteNoop.response.status,200);
assert.equal(receiveAuditDeleteNoop.data?.changed,false);
assert.equal(receiveAuditDeleteNoop.data?.audit,null);

const receiveAuditLog=await request(
  `/api/admin/super/audit?action=inventory_receive_default_change&site=fuxing&q=${encodeURIComponent(receiveAuditCatalogKey)}&pageSize=100`,
  {cookie:admin.cookie}
);
assert.equal(receiveAuditLog.response.status,200);
assert.equal(receiveAuditLog.data?.rows?.length,3,"receive-default audit should contain exactly create/update/delete");
const [receiveDeleteLog,receiveUpdateLog,receiveCreateLog]=receiveAuditLog.data.rows;
for(const row of receiveAuditLog.data.rows){
  assert.equal(row.actor_username,"managerfx");
  assert.equal(row.action,"inventory_receive_default_change");
  assert.equal(row.entity_type,"inventory_receive_default");
  assert.equal(row.entity_id,receiveAuditEntityId);
  assert.equal(row.site,"fuxing");
  assert.equal(row.metadata?.catalog_key,receiveAuditCatalogKey);
}
assert.equal(receiveDeleteLog.metadata?.operation,"delete");
assert.equal(receiveDeleteLog.before_data?.location_code,fxFour.code);
assert.equal(receiveDeleteLog.after_data,null);
assert.equal(receiveUpdateLog.metadata?.operation,"update");
assert.equal(receiveUpdateLog.before_data?.location_code,fxFreezer.code);
assert.equal(receiveUpdateLog.after_data?.location_code,fxFour.code);
assert.equal(receiveCreateLog.metadata?.operation,"create");
assert.equal(receiveCreateLog.before_data,null);
assert.equal(receiveCreateLog.after_data?.location_code,fxFreezer.code);

const catalogAuditKey="fuxing:catalog-audit-regression";
const catalogAuditCatalogKey="catalog-audit-regression";
const catalogAuditCreate=await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:manager.cookie,
  body:{item:{
    key:catalogAuditKey,
    catalog_key:catalogAuditCatalogKey,
    zh:"品項稽核測試",
    vi:"Kiểm thử audit sản phẩm",
    unit:"包",
    work_area:"noodles",
    storage_only:false,
    locations:[{code:fxFreezer.code,quantity:999,minimum:999}],
  }}
});
assert.equal(catalogAuditCreate.response.status,200);
assert.equal(catalogAuditCreate.data?.changed,true);
assert(catalogAuditCreate.data?.audit?.id);

const catalogAuditNoop=await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:manager.cookie,
  body:{item:{
    key:catalogAuditKey,
    catalog_key:catalogAuditCatalogKey,
    zh:"品項稽核測試",
    vi:"Kiểm thử audit sản phẩm",
    unit:"包",
    work_area:"noodles",
    storage_only:false,
    locations:[{code:fxFreezer.code,quantity:111,minimum:222}],
  }}
});
assert.equal(catalogAuditNoop.response.status,200);
assert.equal(catalogAuditNoop.data?.changed,false);
assert.equal(catalogAuditNoop.data?.audit,null);

const catalogAuditUpdate=await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:manager.cookie,
  body:{item:{
    key:catalogAuditKey,
    catalog_key:catalogAuditCatalogKey,
    zh:"品項稽核測試更新",
    vi:"Kiểm thử audit sản phẩm cập nhật",
    unit:"盒",
    work_area:"meat",
    storage_only:true,
    locations:[
      {code:fxFreezer.code,quantity:333,minimum:444},
      {code:fxFour.code,quantity:555,minimum:666},
    ],
  }}
});
assert.equal(catalogAuditUpdate.response.status,200);
assert.equal(catalogAuditUpdate.data?.changed,true);
assert(catalogAuditUpdate.data?.audit?.id);

const catalogAuditSnapshot=(await inventory(admin.cookie,"fuxing")).data;
const catalogAuditItem=catalogAuditSnapshot.items.find((entry)=>entry.item_key===catalogAuditKey);
assert(catalogAuditItem,"catalog audit item missing after update");
assert.equal(catalogAuditItem.name_zh_tw,"品項稽核測試更新");
assert.equal(catalogAuditItem.name_vi,"Kiểm thử audit sản phẩm cập nhật");
assert.equal(catalogAuditItem.unit,"盒");
assert.equal(catalogAuditItem.work_area,"meat");
assert.equal(catalogAuditItem.storage_only,true);
const catalogAuditStock=catalogAuditSnapshot.stock.filter((row)=>row.item_id===catalogAuditItem.id);
assert.equal(catalogAuditStock.length,2);
for(const row of catalogAuditStock){
  assert.equal(Number(row.quantity),0,"catalog sync seeded physical quantity");
  assert.equal(Number(row.minimum_quantity),0,"catalog sync seeded physical minimum");
}

const catalogAuditLog=await request(
  `/api/admin/super/audit?action=inventory_catalog_change&site=fuxing&q=${encodeURIComponent(catalogAuditKey)}&pageSize=100`,
  {cookie:admin.cookie}
);
assert.equal(catalogAuditLog.response.status,200);
assert.equal(catalogAuditLog.data?.rows?.length,2,"catalog audit should contain exactly create/update");
const [catalogUpdateLog,catalogCreateLog]=catalogAuditLog.data.rows;
for(const row of catalogAuditLog.data.rows){
  assert.equal(row.actor_username,"managerfx");
  assert.equal(row.action,"inventory_catalog_change");
  assert.equal(row.entity_type,"inventory_item");
  assert.equal(row.entity_id,catalogAuditKey);
  assert.equal(row.site,"fuxing");
  assert.equal(row.metadata?.item_key,catalogAuditKey);
  assert.equal(row.metadata?.catalog_key,catalogAuditCatalogKey);
}
assert.equal(catalogUpdateLog.metadata?.operation,"update");
assert.equal(catalogUpdateLog.before_data?.name_zh_tw,"品項稽核測試");
assert.equal(catalogUpdateLog.after_data?.name_zh_tw,"品項稽核測試更新");
assert.deepEqual(
  new Set(catalogUpdateLog.before_data?.locations?.map((entry)=>entry.location_code)),
  new Set([fxFreezer.code])
);
assert.deepEqual(
  new Set(catalogUpdateLog.after_data?.locations?.map((entry)=>entry.location_code)),
  new Set([fxFreezer.code,fxFour.code])
);
assert.equal(catalogCreateLog.metadata?.operation,"create");
assert.equal(catalogCreateLog.before_data,null);
assert.equal(catalogCreateLog.after_data?.item_key,catalogAuditKey);

assert.equal((await request("/api/inventory/events")).response.status,401,"inventory event stream must require authentication");
const eventAbort=new AbortController();
const eventResponse=await fetch(BASE+"/api/inventory/events?clientId=api-regression-listener",{
  headers:{cookie:employee.cookie},
  signal:eventAbort.signal,
});
assert.equal(eventResponse.status,200,"authenticated inventory event stream failed");
assert.match(eventResponse.headers.get("content-type")||"",/text\/event-stream/);
const eventReader=eventResponse.body.getReader();
let eventBuffer="";
async function nextInventoryEvent(eventName,timeoutMs=5000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const split=eventBuffer.indexOf("\n\n");
    if(split>=0){
      const block=eventBuffer.slice(0,split);
      eventBuffer=eventBuffer.slice(split+2);
      const type=block.match(/^event:\s*(.+)$/m)?.[1];
      if(type!==eventName)continue;
      const data=block.match(/^data:\s*(.+)$/m)?.[1]||"null";
      return JSON.parse(data);
    }
    const remaining=Math.max(1,deadline-Date.now());
    let timeoutId=0;
    const result=await Promise.race([
      eventReader.read(),
      new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error(`SSE_TIMEOUT_${eventName}`)),remaining);}),
    ]).finally(()=>clearTimeout(timeoutId));
    if(result.done)throw new Error(`SSE_CLOSED_${eventName}`);
    eventBuffer+=new TextDecoder().decode(result.value,{stream:true}).replaceAll("\r\n","\n");
  }
  throw new Error(`SSE_TIMEOUT_${eventName}`);
}
await nextInventoryEvent("ready");

const employeeSet = await request("/api/inventory/set-quantity",{
  method:"POST",cookie:employee.cookie,
  headers:{"x-kitchen-client-id":"api-regression-writer"},
  body:{itemId:beefFx.id,locationId:fxFreezer.id,quantity:99}
});
assert.equal(employeeSet.response.status,200);
assert.equal(Number(employeeSet.data.after),99);
const realtimeEvent=await nextInventoryEvent("inventory");
assert.equal(realtimeEvent.sourceClientId,"api-regression-writer","inventory mutation did not publish its realtime source client id");
assert(Number.isFinite(Number(realtimeEvent.revision)),"inventory realtime revision missing");
eventAbort.abort();
await eventReader.cancel().catch(()=>{});

const employeeMinimum = await request("/api/inventory/set-minimum",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,minimum:3}
});
assert.equal(employeeMinimum.response.status,200,"employee with inventory.edit could not persist minimum");
const parttimeMinimum = await request("/api/inventory/set-minimum",{
  method:"POST",cookie:parttime.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,minimum:99}
});
assert.equal(parttimeMinimum.response.status,403,"view-only inventory account changed a minimum");
assert.equal(parttimeMinimum.data.error,"INVENTORY_EDIT_NOT_ALLOWED");

const supervisorSet = await request("/api/inventory/set-quantity",{
  method:"POST",cookie:supervisor.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,quantity:9}
});
assert.equal(supervisorSet.response.status,200);
assert.equal(Number(supervisorSet.data.after),9);

const supervisorMinimum = await request("/api/inventory/set-minimum",{
  method:"POST",cookie:supervisor.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,minimum:4}
});
assert.equal(supervisorMinimum.response.status,200);

assert.equal((await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:supervisor.cookie,
  body:{item:{key:"fuxing:test-supervisor",catalog_key:"test-supervisor",zh:"測試",vi:"Test",unit:"包",work_area:"noodles",locations:[]}}
})).response.status,200);

assert.equal((await request("/api/inventory/receive-default",{
  method:"POST",cookie:supervisor.cookie,
  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}
})).response.status,200);

const managerCatalog = await request("/api/inventory/catalog/sync",{
  method:"POST",cookie:manager.cookie,
  body:{item:{
    key:"fuxing:test-manager",catalog_key:"test-manager",zh:"管理測試",vi:"Test quản lý",
    unit:"包",work_area:"noodles",storage_only:false,
    locations:[{code:"fuxing-freezer",quantity:1,minimum:1}]
  }}
});
assert.equal(managerCatalog.response.status,200);

// Catalog sync creates only the item/location association. Seed relocation stock
// through the dedicated stocktake APIs so quantity/minimum retain their proper
// authority and audit semantics.
const managerCatalogQuantity = await request("/api/inventory/set-quantity",{
  method:"POST",cookie:supervisor.cookie,
  body:{itemId:managerCatalog.data.item.id,locationId:fxFreezer.id,quantity:1,note:"regression relocate seed quantity"}
});
assert.equal(managerCatalogQuantity.response.status,200);
const managerCatalogMinimum = await request("/api/inventory/set-minimum",{
  method:"POST",cookie:supervisor.cookie,
  body:{itemId:managerCatalog.data.item.id,locationId:fxFreezer.id,minimum:1}
});
assert.equal(managerCatalogMinimum.response.status,200);

const relocateDefault = await request("/api/inventory/receive-default",{
  method:"POST",cookie:manager.cookie,
  body:{site:"fuxing",catalogKey:"test-manager",locationCode:"fuxing-freezer"}
});
assert.equal(relocateDefault.response.status,200);

const relocated = await request("/api/inventory/relocate-storage",{
  method:"POST",cookie:manager.cookie,
  body:{
    itemId:managerCatalog.data.item.id,
    sourceLocationId:fxFreezer.id,
    destinationLocationId:fxFour.id,
    note:"regression relocate storage"
  }
});
assert.equal(relocated.response.status,200);
assert.equal(Number(relocated.data.source_before),1);
assert.equal(Number(relocated.data.source_after),0);
assert.equal(Number(relocated.data.destination_after),1);
assert.equal(Number(relocated.data.destination_minimum_after),1);
assert.equal(relocated.data.receive_default_moved,true);

const relocatedSnapshot = (await inventory(admin.cookie,"fuxing")).data;
const relocatedItem = relocatedSnapshot.items.find((item)=>item.item_key==="fuxing:test-manager");
assert(relocatedItem,"relocated catalog item disappeared");
assert.equal(relocatedSnapshot.stock.some((row)=>row.item_id===relocatedItem.id && row.location_id===fxFreezer.id),false);
const relocatedStock = relocatedSnapshot.stock.find((row)=>row.item_id===relocatedItem.id && row.location_id===fxFour.id);
assert(relocatedStock,"relocation did not create destination stock");
assert.equal(Number(relocatedStock.quantity),1);
assert.equal(Number(relocatedStock.minimum_quantity),1);

const relocatedDefault = await request("/api/inventory/receive-defaults?sites=fuxing&catalogKeys=test-manager",{cookie:admin.cookie});
assert.equal(relocatedDefault.response.status,200);
assert.equal(relocatedDefault.data.defaults?.[0]?.location_code,"fuxing-four");

for (const fixture of [
  {site:"fuxing",cookie:manager.cookie,storage:fxFreezer,source:fxWorkNoodles,destination:fxWorkMeat},
  {site:"yongji",cookie:managerYj.cookie,storage:yjFreezer,source:yjWorkNoodles,destination:yjWorkMeat},
]) {
  const itemKey=`${fixture.site}:work-area-relocation-regression`;
  const catalogKey=`work-area-relocation-${fixture.site}`;
  const saved=await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:fixture.cookie,
    body:{item:{
      key:itemKey,catalog_key:catalogKey,zh:"工作區移動測試",vi:`Kiểm thử đổi khu ${fixture.site}`,
      unit:"包",work_area:"noodles",storage_only:false,
      locations:[{code:fixture.storage.code},{code:fixture.source.code}],
    }}
  });
  assert.equal(saved.response.status,200,`work-area fixture create failed for ${fixture.site}`);
  assert.equal((await request("/api/inventory/set-quantity",{
    method:"POST",cookie:admin.cookie,
    body:{itemId:saved.data.item.id,locationId:fixture.source.id,quantity:3,note:"work area relocation seed"}
  })).response.status,200);
  assert.equal((await request("/api/inventory/set-minimum",{
    method:"POST",cookie:admin.cookie,
    body:{itemId:saved.data.item.id,locationId:fixture.source.id,minimum:2}
  })).response.status,200);

  const moved=await request("/api/inventory/relocate-work-area",{
    method:"POST",cookie:fixture.cookie,
    body:{
      itemId:saved.data.item.id,
      sourceLocationId:fixture.source.id,
      destinationLocationId:fixture.destination.id,
      note:"regression relocate work area",
    }
  });
  assert.equal(moved.response.status,200,`work-area relocation failed for ${fixture.site}`);
  assert.equal(moved.data.work_area,"meat");
  assert.equal(Number(moved.data.source_before),3);
  assert.equal(Number(moved.data.destination_after),3);
  assert.equal(Number(moved.data.destination_minimum_after),2);

  const snapshot=(await inventory(admin.cookie,fixture.site)).data;
  const persisted=snapshot.items.find((item)=>item.item_key===itemKey);
  assert.equal(persisted?.work_area,"meat",`work area metadata did not persist for ${fixture.site}`);
  assert.equal(snapshot.stock.some((row)=>row.item_id===persisted.id&&row.location_id===fixture.source.id),false);
  const target=snapshot.stock.find((row)=>row.item_id===persisted.id&&row.location_id===fixture.destination.id);
  assert.equal(Number(target?.quantity),3);
  assert.equal(Number(target?.minimum_quantity),2);

  const audit=await request(
    `/api/admin/super/audit?action=inventory_work_area_relocate&site=${fixture.site}&q=${encodeURIComponent(saved.data.item.id)}&pageSize=20`,
    {cookie:admin.cookie}
  );
  assert.equal(audit.response.status,200);
  assert.equal(audit.data?.rows?.length,1);
  assert.equal(audit.data.rows[0].before_data?.work_area,"noodles");
  assert.equal(audit.data.rows[0].after_data?.work_area,"meat");
}

for (const [site, locationCode] of [["yongji","yongji-freezer"],["central","central-freezer"]]) {
  const itemKey = `${site}:save-button-regression`;
  const saved = await request("/api/inventory/catalog/sync",{
    method:"POST",cookie:admin.cookie,
    body:{item:{
      key:itemKey,catalog_key:`save-button-${site}`,zh:"儲存測試",vi:`Kiểm thử lưu ${site}`,
      unit:"包",work_area:"noodles",storage_only:false,
      locations:[{code:locationCode,quantity:0,minimum:1}]
    }}
  });
  assert.equal(saved.response.status,200,`catalog save failed for ${site}`);
  const reloaded = await inventory(admin.cookie,site);
  assert(reloaded.data.items.some((item)=>item.item_key===itemKey),`catalog item was not persisted for ${site}`);
}

assert.equal((await request("/api/inventory/receive-default",{
  method:"POST",cookie:managerYj.cookie,
  body:{site:"yongji",catalogKey:"beef",locationCode:"yongji-four"}
})).response.status,200);

const inbound = await request("/api/inventory/adjust",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,direction:"in",amount:2,note:"regression inbound"}
});
assert.equal(inbound.response.status,200);
assert.equal(Number(inbound.data.after),11);

const outbound = await request("/api/inventory/adjust",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,direction:"out",amount:1,note:"regression use"}
});
assert.equal(outbound.response.status,200);
assert.equal(Number(outbound.data.after),10);

const insufficient = await request("/api/inventory/adjust",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,direction:"out",amount:999}
});
assert.equal(insufficient.response.status,409);

const internal = await request("/api/inventory/transfer",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,sourceLocationId:fxFreezer.id,destinationLocationId:fxFour.id,amount:2,note:"regression transfer"}
});
assert.equal(internal.response.status,200);
assert.equal(Number(internal.data.sourceAfter),8);
assert.equal(Number(internal.data.destinationAfter),3);

const crossWrongApi = await request("/api/inventory/transfer",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,sourceLocationId:fxFreezer.id,destinationLocationId:yjFour.id,amount:1}
});
assert.equal(crossWrongApi.response.status,400);
assert.equal(crossWrongApi.data.error,"CROSS_SITE_TRANSFER_REQUIRES_SHIP");

const wrongDestination = await request("/api/inventory/direct-transfer",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,sourceLocationId:fxFreezer.id,destinationLocationId:yjFreezer.id,quantity:1}
});
assert.equal(wrongDestination.response.status,409);
assert.equal(wrongDestination.data.error,"DESTINATION_LOCATION_MUST_USE_RECEIVE_DEFAULT");

const shipment = await request("/api/inventory/direct-transfer",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,sourceLocationId:fxFreezer.id,destinationLocationId:yjFour.id,quantity:1,note:"regression ship"}
});
assert.equal(shipment.response.status,200);

const unconfiguredDestination = await request("/api/inventory/direct-transfer",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:tofuFx.id,sourceLocationId:fxFreezer.id,destinationLocationId:yjFour.id,quantity:1}
});
assert.equal(unconfiguredDestination.response.status,409);
assert.equal(unconfiguredDestination.data.error,"DESTINATION_STORAGE_CONFIGURATION_REQUIRED");

const parttimeAdjust = await request("/api/inventory/adjust",{
  method:"POST",cookie:parttime.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,direction:"in",amount:1}
});
assert.equal(parttimeAdjust.response.status,403);

const createdAdmin = await request("/api/admin/users",{
  method:"POST",cookie:admin.cookie,
  body:{
    action:"create",username:"createdadmin",password:"AdminCreated!123",
    display_name:"Created Admin",role:"admin",location:"fuxing",active:true,
    preferred_language:"zh",
    permissions:Object.fromEntries(MODULES.map((key)=>[key,{view:false,edit:false}]))
  }
});
assert.equal(createdAdmin.response.status,200);
assert.equal(createdAdmin.data.user.location,"all");
assert.equal(createdAdmin.data.user.preferred_language,"zh");
for (const key of MODULES) {
  assert.equal(createdAdmin.data.user.permissions[key]?.view,true);
  assert.equal(createdAdmin.data.user.permissions[key]?.edit,true);
}

const shortPasswordUpdate = await request("/api/admin/users",{
  method:"POST",cookie:admin.cookie,
  body:{
    action:"update",id:createdAdmin.data.user.id,username:"createdadmin",password:"short",
    display_name:"Created Admin",role:"admin",location:"all",active:true,
    permissions:Object.fromEntries(MODULES.map((key)=>[key,{view:true,edit:true}]))
  }
});
assert.equal(shortPasswordUpdate.response.status,400);
assert.equal(shortPasswordUpdate.data.error,"PASSWORD_TOO_SHORT");

const preserveLanguageUpdate = await request("/api/admin/users",{
  method:"POST",cookie:admin.cookie,
  body:{
    action:"update",id:createdAdmin.data.user.id,username:"createdadmin",password:"",
    display_name:"Created Admin Updated",role:"admin",location:"all",active:true,
    permissions:Object.fromEntries(MODULES.map((key)=>[key,{view:true,edit:true}]))
  }
});
assert.equal(preserveLanguageUpdate.response.status,200);
assert.equal(preserveLanguageUpdate.data.user.preferred_language,"zh");
assert.equal((await login("createdadmin","AdminCreated!123")).user.displayName,"Created Admin Updated");

const createdCentral = await request("/api/admin/users",{
  method:"POST",cookie:admin.cookie,
  body:{
    action:"create",username:"createdcentral",password:"CentralCreated!123",
    display_name:"Created Central",role:"central",location:"fuxing",active:true,
    permissions:Object.fromEntries(MODULES.map((key)=>[key,{view:key==="inventory",edit:key==="inventory"}]))
  }
});
assert.equal(createdCentral.response.status,200);
assert.equal(createdCentral.data.user.location,"central");
const createdCentralSession = await login("createdcentral","CentralCreated!123");
assert.equal(createdCentralSession.user.location,"central");
assert.equal((await inventory(createdCentralSession.cookie,"central")).response.status,200);
assert.equal((await inventory(createdCentralSession.cookie,"fuxing")).response.status,403);

const selfDemote = await request("/api/admin/users",{
  method:"POST",cookie:admin.cookie,
  body:{
    action:"update",id:admin.user.id,username:"yangchuadmin",display_name:"yangchuadmin",
    role:"manager",location:"fuxing",active:true,permissions:{}
  }
});
assert.equal(selfDemote.response.status,409);

const logout = await request("/api/auth/logout",{method:"POST",cookie:employee.cookie});
assert.equal(logout.response.status,200);
assert.equal((await request("/api/auth/me",{cookie:employee.cookie})).response.status,401);

console.log("API_REGRESSION_OK");
