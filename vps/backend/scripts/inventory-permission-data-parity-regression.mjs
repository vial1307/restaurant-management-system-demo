import assert from "node:assert/strict";
import { pool } from "../src/db.mjs";
import { hashPassword } from "../src/password.mjs";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie") || "";
  const match = raw.match(/(?:^|,\s*)kitchen_session=([^;]+)/i);
  return match ? `kitchen_session=${match[1]}` : "";
}

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ username, password:PASSWORD }),
  });
  assert.equal(response.status, 200, `${username}: login failed ${response.status}`);
  const cookie = cookieFrom(response);
  assert(cookie, `${username}: session cookie missing`);
  const body = await response.json();
  return { username, cookie, user:body.user };
}

async function request(client, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers:{
      ...(options.body ? { "content-type":"application/json" } : {}),
      ...(options.headers || {}),
      cookie:client.cookie,
    },
  });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function canonicalSnapshot(payload) {
  return {
    site:payload.site,
    items:[...(payload.items || [])]
      .map((item) => ({
        id:item.id,
        item_key:item.item_key,
        catalog_key:item.catalog_key,
        name_zh_tw:item.name_zh_tw,
        name_vi:item.name_vi,
        unit:item.unit,
        work_area:item.work_area,
        storage_only:item.storage_only,
      }))
      .sort((a,b) => a.id.localeCompare(b.id)),
    locations:[...(payload.locations || [])]
      .map((location) => ({
        id:location.id,
        code:location.code,
        name_zh_tw:location.name_zh_tw,
        name_vi:location.name_vi,
        site:location.site,
        kind:location.kind,
      }))
      .sort((a,b) => a.id.localeCompare(b.id)),
    stock:[...(payload.stock || [])]
      .map((row) => ({
        item_id:row.item_id,
        location_id:row.location_id,
        quantity:Number(row.quantity),
        minimum_quantity:Number(row.minimum_quantity),
      }))
      .sort((a,b) => `${a.item_id}:${a.location_id}`.localeCompare(`${b.item_id}:${b.location_id}`)),
  };
}

const clients = {};
for (const username of ["managerfx", "supervisorfx", "employeefx", "parttimefx"]) {
  clients[username] = await login(username);
}

let baseline = null;
for (const username of Object.keys(clients)) {
  const result = await request(clients[username], "/api/inventory/fuxing");
  assert.equal(result.response.status, 200, `${username}: Fuxing inventory view denied`);
  const snapshot = canonicalSnapshot(result.body);
  if (!baseline) baseline = snapshot;
  else assert.deepEqual(snapshot, baseline, `${username}: same-site inventory payload differs by role`);
}

const beef = baseline.items.find((item) => item.catalog_key === "beef");
assert(beef, "Fuxing beef fixture missing");
const beefStock = baseline.stock.find((row) => row.item_id === beef.id && row.quantity > 0);
assert(beefStock, "Fuxing beef stock fixture missing");
const beforeQuantity = beefStock.quantity;

const increment = await request(clients.managerfx, "/api/inventory/adjust", {
  method:"POST",
  body:JSON.stringify({
    itemId:beef.id,
    locationId:beefStock.location_id,
    direction:"in",
    amount:1,
    note:"inventory parity regression",
  }),
});
assert.equal(increment.response.status, 200, "manager should be allowed to adjust branch inventory");

const employeeAfter = await request(clients.employeefx, "/api/inventory/fuxing");
assert.equal(employeeAfter.response.status, 200);
const changed = canonicalSnapshot(employeeAfter.body).stock.find((row) => row.item_id === beef.id && row.location_id === beefStock.location_id);
assert.equal(changed?.quantity, beforeQuantity + 1, "authorized write was not visible to a second role");

const parttimeWrite = await request(clients.parttimefx, "/api/inventory/adjust", {
  method:"POST",
  body:JSON.stringify({
    itemId:beef.id,
    locationId:beefStock.location_id,
    direction:"out",
    amount:1,
    note:"view-only mutation must fail",
  }),
});
assert.equal(parttimeWrite.response.status, 403, "part-time view-only inventory role unexpectedly mutated stock");

const foreignRead = await request(clients.employeefx, "/api/inventory/yongji");
assert.equal(foreignRead.response.status, 403, "site-scoped employee unexpectedly read foreign inventory");

const restore = await request(clients.managerfx, "/api/inventory/adjust", {
  method:"POST",
  body:JSON.stringify({
    itemId:beef.id,
    locationId:beefStock.location_id,
    direction:"out",
    amount:1,
    note:"restore inventory parity regression fixture",
  }),
});
assert.equal(restore.response.status, 200, "failed to restore parity fixture quantity");

const legacyUsername = `legacyparity${Date.now()}`;
let legacyId = null;
try {
  const passwordHash = await hashPassword(PASSWORD);
  const inserted = await pool.query(
    `insert into public.app_users(
       username,display_name,password_hash,password_changed_at,
       role,location,permissions,preferred_language,active
     ) values($1,$2,$3,now(),'employee','fuxing',$4::jsonb,'vi',true)
     returning id`,
    [legacyUsername, legacyUsername, passwordHash, JSON.stringify({ dashboard:{view:true,edit:false} })]
  );
  legacyId = inserted.rows[0]?.id;
  assert(legacyId, "legacy partial-permission fixture insert failed");

  const legacy = await login(legacyUsername);
  assert.deepEqual(legacy.user.permissions.inventory, { view:true, edit:true }, "legacy missing inventory permission did not inherit employee default in public session");
  const inheritedRead = await request(legacy, "/api/inventory/fuxing");
  assert.equal(inheritedRead.response.status, 200, "backend authorization did not inherit the same inventory role default as frontend");

  await pool.query(
    "update public.app_users set permissions=$2::jsonb where id=$1",
    [legacyId, JSON.stringify({ inventory:{view:false,edit:true} })]
  );
  const explicitDeny = await request(legacy, "/api/inventory/fuxing");
  assert.equal(explicitDeny.response.status, 403, "explicit inventory deny did not override role default");
  const me = await request(legacy, "/api/auth/me");
  assert.equal(me.response.status, 200);
  assert.deepEqual(me.body.user.permissions.inventory, { view:false, edit:false }, "public session permissions disagree with backend authorization after explicit deny");
} finally {
  if (legacyId) {
    await pool.query("delete from public.sessions where user_id=$1", [legacyId]).catch(() => {});
    await pool.query("delete from public.app_users where id=$1", [legacyId]).catch(() => {});
  }
  await pool.end();
}

console.log("INVENTORY_PERMISSION_DATA_PARITY_API_OK");
