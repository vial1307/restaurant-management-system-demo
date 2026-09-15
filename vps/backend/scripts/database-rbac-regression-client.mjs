import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";

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
  return { response, data, cookie:response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function login(username) {
  const result = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password:PASSWORD },
  });
  assert.equal(result.response.status,200,`login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie,`missing session cookie for ${username}`);
  return result;
}

const health = await request("/api/health");
assert.equal(health.response.status,200);
assert.equal(health.data.schema,"013");

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const assistant = await login("assistantfx");
const remote = await login("remoteonly");

assert.equal(admin.data.user.capabilities["accounts.manage"],true);
assert.equal(manager.data.user.permissions.settings?.view,true,"manager permission must come from database rank, not legacy per-user JSON");
assert.equal(manager.data.user.permissions.settings?.edit,false);

const accessModel = await request("/api/admin/access-model",{cookie:admin.cookie});
assert.equal(accessModel.response.status,200);
assert(Array.isArray(accessModel.data.roles));
assert(Array.isArray(accessModel.data.modules));
assert(accessModel.data.roles.some((role)=>role.code==="assistant_manager"),"database-added assistant_manager rank missing from access model");
assert(accessModel.data.roles.some((role)=>role.code==="remote_only"),"database-added remote_only rank missing from access model");
assert.equal((await request("/api/admin/access-model",{cookie:manager.cookie})).response.status,403);

assert.equal(assistant.data.user.role,"assistant_manager");
assert.equal(assistant.data.user.policyRole,"supervisor","database capability inheritance must drive legacy policy compatibility");
assert.equal(assistant.data.user.roleParent,"supervisor");
assert.equal(assistant.data.user.hierarchyLevel,35);
assert.equal(assistant.data.user.permissions.inventory?.view,true);
assert.equal(assistant.data.user.permissions.inventory?.edit,true);
assert.equal(assistant.data.user.permissions.procurement?.edit,true);
assert.equal(assistant.data.user.permissions.settings?.view,false);
assert.equal(assistant.data.user.capabilities["inventory.stocktake"],true);
assert.equal(assistant.data.user.capabilities["inventory.receive_defaults.manage"],false);
assert.equal(assistant.data.user.capabilities["accounts.manage"],false);

const assistantInventory = await request("/api/inventory/fuxing",{cookie:assistant.cookie});
assert.equal(assistantInventory.response.status,200);
const beef = assistantInventory.data.items.find((item)=>item.catalog_key==="beef");
const freezer = assistantInventory.data.locations.find((location)=>location.code==="fuxing-freezer");
assert(beef && freezer);
const assistantStocktake = await request("/api/inventory/set-minimum",{
  method:"POST",
  cookie:assistant.cookie,
  body:{itemId:beef.id,locationId:freezer.id,minimum:4},
});
assert.equal(assistantStocktake.response.status,200,"new database rank must inherit supervisor stocktake authorization without code changes");
const assistantReceiveDefault = await request("/api/inventory/receive-default",{
  method:"POST",
  cookie:assistant.cookie,
  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"},
});
assert.equal(assistantReceiveDefault.response.status,403);
assert.equal(assistantReceiveDefault.data.error,"RECEIVE_DEFAULT_MANAGER_REQUIRED");

assert.equal(remote.data.user.role,"remote_only");
assert.equal(remote.data.user.permissions.remote?.view,true);
assert.equal(remote.data.user.permissions.remote?.edit,true);
assert.equal(remote.data.user.permissions.dashboard?.view,false);
assert.equal(remote.data.user.permissions.preparation?.view,false);
assert.equal(remote.data.user.capabilities["workforce.self_service"],false);

const created = await request("/api/admin/users",{
  method:"POST",
  cookie:admin.cookie,
  body:{
    action:"create",
    username:"dbrolecreated",
    password:PASSWORD,
    display_name:"DB Role Created",
    role:"assistant_manager",
    location:"fuxing",
    active:true,
    permissions:{settings:{view:true,edit:true}},
  },
});
assert.equal(created.response.status,200,JSON.stringify(created.data));
assert.equal(created.data.user.role,"assistant_manager");
assert.equal(created.data.user.permissions.settings?.view,false,"client permission JSON must not override database rank");
assert.equal(created.data.user.permissions.inventory?.edit,true);
assert.equal(created.data.user.capabilities["inventory.stocktake"],true);

const createdLogin = await login("dbrolecreated");
assert.equal(createdLogin.data.user.role,"assistant_manager");
assert.equal(createdLogin.data.user.permissions.inventory?.edit,true);
assert.equal(createdLogin.data.user.permissions.settings?.view,false);

const invalidRole = await request("/api/admin/users",{
  method:"POST",
  cookie:admin.cookie,
  body:{
    action:"create",
    username:"invalidrank",
    password:"InvalidRank!123",
    display_name:"Invalid Rank",
    role:"not_in_database",
    location:"fuxing",
    active:true,
  },
});
assert.equal(invalidRole.response.status,400);
assert.equal(invalidRole.data.error,"INVALID_ROLE");

const deleted = await request(`/api/admin/users/${encodeURIComponent(created.data.user.id)}`,{
  method:"DELETE",
  cookie:admin.cookie,
});
assert.equal(deleted.response.status,200);

console.log("DATABASE_RBAC_REGRESSION_OK");
