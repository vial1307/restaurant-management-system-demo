import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const DB = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || "kitchen_test",
  user:process.env.POSTGRES_USER || "kitchen_test",
  password:process.env.POSTGRES_PASSWORD || "kitchen_test",
});

async function request(path, { method="GET", cookie="", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers:{
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type":"application/json" }),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function login(username) {
  const { response, data } = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password:"KitchenTest!123" },
  });
  assert.equal(response.status, 200, `login failed for ${username}: ${JSON.stringify(data)}`);
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert(cookie.includes("kitchen_session="), `session cookie missing for ${username}`);
  return { cookie, user:data.user };
}

await DB.connect();
try {
  const schema = await DB.query(`select version from public.schema_migrations order by version desc limit 1`);
  assert.equal(schema.rows[0]?.version, "016");

  for (const site of ["central","fuxing","yongji"]) {
    const workAreas = await DB.query(
      `select code,active from public.work_areas where site_code=$1 order by code`,
      [site]
    );
    assert.deepEqual(workAreas.rows.filter((row)=>row.active).map((row)=>row.code).sort(), ["meat","noodles","seafood","soup"]);
  }

  const canonicalCodes = [
    "central-freezer","central-fridge","central-four-door","central-chest","central-work-use",
    "fuxing-large-freezer","fuxing-large-fridge","fuxing-four-door","fuxing-kitchen",
    "fuxing-work-noodles","fuxing-work-soup","fuxing-work-seafood","fuxing-work-meat",
    "yongji-large-freezer","yongji-large-fridge","yongji-four-door","yongji-kitchen",
    "yongji-work-noodles","yongji-work-soup","yongji-work-seafood","yongji-work-meat",
  ];
  const canonicalLocations = await DB.query(
    `select code from public.inventory_locations where code=any($1::text[])`,
    [canonicalCodes]
  );
  assert.equal(canonicalLocations.rowCount, canonicalCodes.length, "canonical location seed incomplete");

  await assert.rejects(
    DB.query(
      `insert into public.inventory_items(item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active)
       values('fuxing:invalid-area-regression','invalid-area-regression','錯誤工作區','Khu sai','包','missing-area',false,true)`,
    ),
    (error) => error?.code === "23503" && String(error?.message || "").includes("INVENTORY_WORK_AREA_NOT_FOUND"),
    "inventory items must be rejected when work_area is not active master data for the site"
  );

  const admin = await login("yangchuadmin");
  const manager = await login("managerfx");
  const employee = await login("employeefx");

  assert.equal(admin.user.capabilities["system.master_data.manage"], true);
  assert.equal(manager.user.capabilities["inventory.locations.manage"], true);
  assert.equal(manager.user.capabilities["operations.work_areas.manage"], true);

  const adminMaster = await request("/api/master-data/fuxing?includeInactive=true", { cookie:admin.cookie });
  assert.equal(adminMaster.response.status, 200);
  assert.equal(adminMaster.data.site.code, "fuxing");
  assert.equal(adminMaster.data.permissions.manageLocations, true);
  assert.equal(adminMaster.data.permissions.manageWorkAreas, true);

  const managerMaster = await request("/api/master-data/fuxing?includeInactive=true", { cookie:manager.cookie });
  assert.equal(managerMaster.response.status, 200);
  assert.equal(managerMaster.data.permissions.manageLocations, true);
  assert.equal(managerMaster.data.permissions.manageWorkAreas, true);

  const employeeMaster = await request("/api/master-data/fuxing", { cookie:employee.cookie });
  assert.equal(employeeMaster.response.status, 200);
  assert.equal(employeeMaster.data.permissions.manageLocations, false);
  assert.equal(employeeMaster.data.permissions.manageWorkAreas, false);

  const centralDenied = await request("/api/master-data/central", { cookie:manager.cookie });
  assert.equal(centralDenied.response.status, 403);
  assert.equal(centralDenied.data.error, "SITE_NOT_ALLOWED");

  const createdLocation = await request("/api/master-data/locations", {
    method:"POST",
    cookie:manager.cookie,
    body:{
      action:"save",
      site:"fuxing",
      code:"fuxing-regression-cold-room",
      name_zh_tw:"回歸冷藏",
      name_vi:"Kho mát regression",
      kind:"storage",
      sort_order:88,
      active:true,
      metadata:{ regression:true },
    },
  });
  assert.equal(createdLocation.response.status, 200, JSON.stringify(createdLocation.data));
  assert.equal(createdLocation.data.location.code, "fuxing-regression-cold-room");

  const audit = await DB.query(
    `select action,entity_type,metadata
     from public.audit_logs
     where actor_user_id=$1 and entity_type='inventory_location'
     order by created_at desc
     limit 1`,
    [manager.user.id]
  );
  assert.equal(audit.rows[0]?.action, "master_data.location.create");
  assert.equal(audit.rows[0]?.metadata?.site, "fuxing");

  const employeeWrite = await request("/api/master-data/locations", {
    method:"POST",
    cookie:employee.cookie,
    body:{
      action:"save",
      site:"fuxing",
      code:"fuxing-employee-denied",
      name_zh_tw:"拒絕",
      name_vi:"Từ chối",
      kind:"storage",
      active:true,
    },
  });
  assert.equal(employeeWrite.response.status, 403);
  assert.equal(employeeWrite.data.error, "LOCATION_MANAGE_NOT_ALLOWED");

  const createdWorkArea = await request("/api/master-data/work-areas", {
    method:"POST",
    cookie:manager.cookie,
    body:{
      action:"save",
      site:"fuxing",
      code:"bar",
      department_code:"inside",
      name_zh_tw:"吧台",
      name_vi:"Quầy bar",
      sort_order:80,
      active:true,
      metadata:{ regression:true },
    },
  });
  assert.equal(createdWorkArea.response.status, 200, JSON.stringify(createdWorkArea.data));
  assert.equal(createdWorkArea.data.workArea.code, "bar");

  const archiveWorkArea = await request("/api/master-data/work-areas", {
    method:"POST",
    cookie:manager.cookie,
    body:{ action:"archive", site:"fuxing", code:"bar" },
  });
  assert.equal(archiveWorkArea.response.status, 200, JSON.stringify(archiveWorkArea.data));
  assert.equal(archiveWorkArea.data.archived, true);

  const archiveLocation = await request("/api/master-data/locations", {
    method:"POST",
    cookie:manager.cookie,
    body:{ action:"archive", site:"fuxing", id:createdLocation.data.location.id },
  });
  assert.equal(archiveLocation.response.status, 200, JSON.stringify(archiveLocation.data));
  assert.equal(archiveLocation.data.archived, true);

  console.log("MASTER_DATA_REGRESSION_OK");
} finally {
  await DB.end();
}
