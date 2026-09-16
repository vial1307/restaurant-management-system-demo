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
  assert.equal(schema.rows[0]?.version, "015");

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

  const admin = await login("yangchuadmin");
  const manager = await login("managerfx");
  const employee = await login("employeefx");

  assert.equal(admin.user.capabilities["system.master_data.manage"], true);
  assert.equal(manager.user.capabilities["inventory.locations.manage"], true);
  assert.equal(manager.user.capabilities["operations.work_areas.manage"], true);
  assert.equal(employee.user.capabilities["inventory.locations.manage"], false);

  const overview = await request("/api/admin/overview", { cookie:admin.cookie });
  assert.equal(overview.response.status, 200);
  assert.equal(overview.data.schema.version, "015");
  assert(Number(overview.data.counts.active_locations) >= canonicalCodes.length);
  assert(Number(overview.data.counts.active_work_areas) >= 12);

  const adminFuxing = await request("/api/master-data/fuxing?includeInactive=true", { cookie:admin.cookie });
  assert.equal(adminFuxing.response.status, 200);
  assert.equal(adminFuxing.data.permissions.manageAll, true);
  assert.equal(adminFuxing.data.permissions.manageLocations, true);
  assert(adminFuxing.data.locations.some((row)=>row.code === "fuxing-large-freezer"));
  assert(adminFuxing.data.workAreas.some((row)=>row.code === "noodles"));

  const created = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"save", site:"fuxing", code:"fuxing-regression-cold", name_zh_tw:"回歸冷藏", name_vi:"Tủ mát regression", kind:"storage", sort_order:75, active:true, metadata:{ regression:true } },
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.data));
  const createdId = created.data.location.id;

  const updated = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"save", id:createdId, site:"fuxing", code:"fuxing-regression-cold", name_zh_tw:"回歸冷藏更新", name_vi:"Tủ mát regression cập nhật", kind:"storage", sort_order:76, active:true, metadata:{ regression:true } },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.location.name_zh_tw, "回歸冷藏更新");

  const immutable = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"save", id:createdId, site:"fuxing", code:"fuxing-renamed", name_zh_tw:"X", name_vi:"X", kind:"storage", sort_order:76, active:true },
  });
  assert.equal(immutable.response.status, 409);
  assert.equal(immutable.data.error, "LOCATION_CODE_IMMUTABLE");

  const managerOwn = await request("/api/master-data/locations", {
    method:"POST", cookie:manager.cookie,
    body:{ action:"save", site:"fuxing", code:"fuxing-manager-bin", name_zh_tw:"主管測試櫃", name_vi:"Tủ test manager", kind:"storage", sort_order:80, active:true },
  });
  assert.equal(managerOwn.response.status, 200, JSON.stringify(managerOwn.data));

  const managerOther = await request("/api/master-data/locations", {
    method:"POST", cookie:manager.cookie,
    body:{ action:"save", site:"yongji", code:"yongji-manager-forbidden", name_zh_tw:"禁止", name_vi:"Forbidden", kind:"storage", sort_order:80, active:true },
  });
  assert.equal(managerOther.response.status, 403);
  assert.equal(managerOther.data.error, "SITE_NOT_ALLOWED");

  const employeeWrite = await request("/api/master-data/locations", {
    method:"POST", cookie:employee.cookie,
    body:{ action:"save", site:"fuxing", code:"fuxing-employee-forbidden", name_zh_tw:"禁止", name_vi:"Forbidden", kind:"storage", sort_order:80, active:true },
  });
  assert.equal(employeeWrite.response.status, 403);
  assert.equal(employeeWrite.data.error, "LOCATION_MANAGE_NOT_ALLOWED");

  const fuxingPositive = await DB.query(`select id from public.inventory_locations where code='fuxing-freezer'`);
  const positiveArchive = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"archive", site:"fuxing", id:String(fuxingPositive.rows[0].id) },
  });
  assert.equal(positiveArchive.response.status, 409);
  assert.equal(positiveArchive.data.error, "LOCATION_HAS_POSITIVE_STOCK");

  const yongjiDefault = await DB.query(`select id from public.inventory_locations where code='yongji-four'`);
  const defaultArchive = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"archive", site:"yongji", id:String(yongjiDefault.rows[0].id) },
  });
  assert.equal(defaultArchive.response.status, 409);
  assert.equal(defaultArchive.data.error, "LOCATION_IS_RECEIVE_DEFAULT");

  const areaUpdate = await request("/api/master-data/work-areas", {
    method:"POST", cookie:manager.cookie,
    body:{ action:"save", site:"fuxing", code:"noodles", name_zh_tw:"麵區測試", name_vi:"Khu mì test", department_code:"inside", sort_order:11, active:true, metadata:{ regression:true } },
  });
  assert.equal(areaUpdate.response.status, 200, JSON.stringify(areaUpdate.data));
  assert.equal(areaUpdate.data.workArea.name_zh_tw, "麵區測試");

  const areaOther = await request("/api/master-data/work-areas", {
    method:"POST", cookie:manager.cookie,
    body:{ action:"save", site:"yongji", code:"noodles", name_zh_tw:"禁止", name_vi:"Forbidden", department_code:"inside", sort_order:11, active:true },
  });
  assert.equal(areaOther.response.status, 403);

  const areaEmployee = await request("/api/master-data/work-areas", {
    method:"POST", cookie:employee.cookie,
    body:{ action:"save", site:"fuxing", code:"soup", name_zh_tw:"禁止", name_vi:"Forbidden", department_code:"inside", sort_order:20, active:true },
  });
  assert.equal(areaEmployee.response.status, 403);
  assert.equal(areaEmployee.data.error, "WORK_AREA_MANAGE_NOT_ALLOWED");

  const archived = await request("/api/master-data/locations", {
    method:"POST", cookie:admin.cookie,
    body:{ action:"archive", site:"fuxing", id:createdId },
  });
  assert.equal(archived.response.status, 200);
  assert.equal(archived.data.location.active, false);

  const persisted = await request("/api/master-data/fuxing?includeInactive=true", { cookie:admin.cookie });
  assert.equal(persisted.response.status, 200);
  const archivedPersisted = persisted.data.locations.find((row)=>row.id === createdId);
  assert(archivedPersisted);
  assert.equal(archivedPersisted.active, false);
  assert.equal(persisted.data.workAreas.find((row)=>row.code === "noodles").name_zh_tw, "麵區測試");

  const audit = await DB.query(
    `select action from public.audit_logs where action like 'master_%' order by created_at`,
  );
  assert(audit.rows.some((row)=>row.action === "master_location_create"));
  assert(audit.rows.some((row)=>row.action === "master_location_update"));
  assert(audit.rows.some((row)=>row.action === "master_location_archive"));
  assert(audit.rows.some((row)=>row.action === "master_work_area_update"));

  console.log("MASTER_DATA_REGRESSION_OK");
} finally {
  await DB.end();
}
