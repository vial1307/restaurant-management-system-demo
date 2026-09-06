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

async function request(pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(BASE + pathname, {
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

async function login(username) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { username, password: PASSWORD },
  });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `missing session cookie for ${username}`);
  return result.cookie;
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const central = await login("centralreg");

for (const [label, cookie] of [["employee", employee], ["supervisor", supervisor]]) {
  const denied = await request("/api/inventory/receive-default", {
    method: "POST",
    cookie,
    body: { site:"fuxing", catalogKey:"beef", locationCode:"fuxing-four" },
  });
  assert.equal(denied.response.status, 403, `${label} unexpectedly changed a branch-owned receiving default`);
  assert.equal(denied.data?.error, "RECEIVE_DEFAULT_MANAGER_REQUIRED");
}

const centralDenied = await request("/api/inventory/receive-default", {
  method: "POST",
  cookie: central,
  body: { site:"central", catalogKey:"beef", locationCode:"central-freezer" },
});
assert.equal(centralDenied.response.status, 403, "central-kitchen role unexpectedly received receiving-default ownership authority");
assert.equal(centralDenied.data?.error, "RECEIVE_DEFAULT_MANAGER_REQUIRED");

const managerSaved = await request("/api/inventory/receive-default", {
  method: "POST",
  cookie: manager,
  body: { site:"fuxing", catalogKey:"beef", locationCode:"fuxing-four" },
});
assert.equal(managerSaved.response.status, 200, `branch manager could not set receiving default: ${JSON.stringify(managerSaved.data)}`);

const invalidConfiguredLocation = await request("/api/inventory/receive-default", {
  method: "POST",
  cookie: manager,
  body: { site:"fuxing", catalogKey:"tofu", locationCode:"fuxing-four" },
});
assert.equal(invalidConfiguredLocation.response.status, 409, "manager saved a receiving default outside the product's configured storage locations");
assert.equal(invalidConfiguredLocation.data?.error, "RECEIVE_DEFAULT_LOCATION_NOT_CONFIGURED");

const invalidPersisted = await request("/api/inventory/receive-defaults?sites=fuxing&catalogKeys=tofu", { cookie: admin });
assert.equal(invalidPersisted.response.status, 200);
assert.equal(
  invalidPersisted.data?.defaults?.some((row) => row.site === "fuxing" && row.catalog_key === "tofu"),
  false,
  "rejected receiving default was still persisted",
);

const wrongSite = await request("/api/inventory/receive-default", {
  method: "POST",
  cookie: manager,
  body: { site:"yongji", catalogKey:"beef", locationCode:"yongji-four" },
});
assert.equal(wrongSite.response.status, 403, "branch manager unexpectedly changed another site's receiving default");
assert.equal(wrongSite.data?.error, "INVENTORY_EDIT_NOT_ALLOWED");

const adminCentral = await request("/api/inventory/receive-default", {
  method: "POST",
  cookie: admin,
  body: { site:"central", catalogKey:"beef", locationCode:"central-freezer" },
});
assert.equal(adminCentral.response.status, 200, "admin override for receiving-default configuration failed");

const persisted = await request("/api/inventory/receive-defaults?sites=fuxing&catalogKeys=beef", { cookie: admin });
assert.equal(persisted.response.status, 200);
const fuxingDefault = persisted.data?.defaults?.find((row) => row.site === "fuxing" && row.catalog_key === "beef");
assert(fuxingDefault, "manager receiving default was not persisted");
assert.equal(fuxingDefault.location_code, "fuxing-four");

const routingRead = await request("/api/inventory/receive-defaults?sites=fuxing,yongji&catalogKeys=beef", { cookie: central });
assert.equal(routingRead.response.status, 200, "shipping role lost cross-site receiving routing metadata");
assert(routingRead.data?.defaults?.some((row) => row.site === "fuxing" && row.catalog_key === "beef"));
assert(routingRead.data?.defaults?.some((row) => row.site === "yongji" && row.catalog_key === "beef"));

// Defense in depth: simulate stale/corrupt data that predates the API guard.
// direct-transfer must reject it before creating an inventory_stock row.
const db = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});
await db.connect();
let badLocationId = "";
let validReceiveLocationId = "";
let managerUserId = "";
try {
  const source = await db.query(
    `select i.id as item_id,l.id as location_id
     from public.inventory_items i
     join public.inventory_stock s on s.item_id=i.id
     join public.inventory_locations l on l.id=s.location_id
     where i.item_key='yongji:beef' and l.code='yongji-freezer'
     limit 1`
  );
  assert.equal(source.rowCount, 1, "missing yongji beef source fixture");

  const managerRow = await db.query("select id from public.app_users where username='managerfx' limit 1");
  const validLocation = await db.query("select id from public.inventory_locations where code='fuxing-four' limit 1");
  assert.equal(managerRow.rowCount, 1, "missing manager fixture");
  assert.equal(validLocation.rowCount, 1, "missing valid Fuxing receiving location fixture");
  managerUserId = managerRow.rows[0].id;
  validReceiveLocationId = validLocation.rows[0].id;

  const badLocation = await db.query(
    `insert into public.inventory_locations(code,name_zh_tw,name_vi,site,kind,sort_order,active)
     values('fuxing-routing-corrupt','測試未配置儲位','Vị trí test chưa cấu hình','fuxing','storage',80,true)
     returning id`
  );
  badLocationId = badLocation.rows[0].id;

  const seedSource = await request("/api/inventory/set-quantity", {
    method:"POST",
    cookie:admin,
    body:{ itemId:source.rows[0].item_id, locationId:source.rows[0].location_id, quantity:2, note:"routing integrity regression seed" },
  });
  assert.equal(seedSource.response.status, 200, `could not seed shipping source: ${JSON.stringify(seedSource.data)}`);

  await db.query(
    `insert into public.inventory_receive_defaults(site,catalog_key,location_id,updated_by,updated_at)
     values('fuxing','beef',$1,$2,now())
     on conflict(site,catalog_key) do update
     set location_id=excluded.location_id,updated_by=excluded.updated_by,updated_at=now()`,
    [badLocationId,managerUserId],
  );

  const rejectedTransfer = await request("/api/inventory/direct-transfer", {
    method:"POST",
    cookie:admin,
    body:{
      itemId:source.rows[0].item_id,
      sourceLocationId:source.rows[0].location_id,
      destinationLocationId:badLocationId,
      quantity:1,
      note:"corrupt receiving-default regression",
    },
  });
  assert.equal(rejectedTransfer.response.status, 409, "direct-transfer trusted a receiving default outside the configured storage set");
  assert.equal(rejectedTransfer.data?.error, "DESTINATION_RECEIVE_DEFAULT_NOT_CONFIGURED");

  const leakedStock = await db.query(
    `select 1
     from public.inventory_stock s
     join public.inventory_items i on i.id=s.item_id
     where i.item_key='fuxing:beef' and s.location_id=$1`,
    [badLocationId],
  );
  assert.equal(leakedStock.rowCount, 0, "direct-transfer created stock at an unconfigured receiving location");
} finally {
  if (badLocationId) {
    await db.query("delete from public.inventory_stock where location_id=$1", [badLocationId]);
  }
  if (validReceiveLocationId && managerUserId) {
    await db.query(
      `insert into public.inventory_receive_defaults(site,catalog_key,location_id,updated_by,updated_at)
       values('fuxing','beef',$1,$2,now())
       on conflict(site,catalog_key) do update
       set location_id=excluded.location_id,updated_by=excluded.updated_by,updated_at=now()`,
      [validReceiveLocationId,managerUserId],
    );
  }
  if (badLocationId) {
    await db.query("delete from public.inventory_locations where id=$1", [badLocationId]);
  }
  await db.end();
}

console.log("receiving-default API regression passed");
