import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const MODULES = ["dashboard","inventory","procurement","reservations","preparation","menu","sop","skills","attendance","schedule","reports","remote","settings"];

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
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
const yjFreezer = yongjiData.locations.find((loc) => loc.code === "yongji-freezer");
const yjFour = yongjiData.locations.find((loc) => loc.code === "yongji-four");
assert(beefFx && tofuFx && beefYj && tofuYj && fxFreezer && fxFour && yjFreezer && yjFour);

assert.equal((await request("/api/inventory/fuxing/transactions",{cookie:manager.cookie})).response.status,403);
assert.equal((await request("/api/inventory/fuxing/transactions",{cookie:admin.cookie})).response.status,200);

const employeeSet = await request("/api/inventory/set-quantity",{
  method:"POST",cookie:employee.cookie,
  body:{itemId:beefFx.id,locationId:fxFreezer.id,quantity:99}
});
assert.equal(employeeSet.response.status,200);
assert.equal(Number(employeeSet.data.after),99);

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
