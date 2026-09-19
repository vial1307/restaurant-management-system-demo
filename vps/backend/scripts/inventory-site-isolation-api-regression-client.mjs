import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers:{
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
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
  assert.equal(result.response.status,200);
  assert(result.cookie);
  return result.cookie;
}

const admin = await login("yangchuadmin");
const [fx,yj,central] = await Promise.all([
  request("/api/inventory/fuxing",{cookie:admin}),
  request("/api/inventory/yongji",{cookie:admin}),
  request("/api/inventory/central",{cookie:admin}),
]);
for(const result of [fx,yj,central]) assert.equal(result.response.status,200);

const fxItem = fx.data.items[0];
const fxStorage = fx.data.locations.find((row)=>row.kind==="storage");
const yjStorages = yj.data.locations.filter((row)=>row.kind==="storage");
const centralStorage = central.data.locations.find((row)=>row.kind==="storage");
assert(fxItem && fxStorage && yjStorages.length >= 2 && centralStorage);

const crossQuantity = await request("/api/inventory/set-quantity",{
  method:"POST",cookie:admin,
  body:{itemId:fxItem.id,locationId:yjStorages[0].id,quantity:77},
});
assert.equal(crossQuantity.response.status,400);
assert.equal(crossQuantity.data.error,"ITEM_SITE_MISMATCH");

const crossMinimum = await request("/api/inventory/set-minimum",{
  method:"POST",cookie:admin,
  body:{itemId:fxItem.id,locationId:yjStorages[0].id,minimum:11},
});
assert.equal(crossMinimum.response.status,400);
assert.equal(crossMinimum.data.error,"ITEM_SITE_MISMATCH");

const crossAdjust = await request("/api/inventory/adjust",{
  method:"POST",cookie:admin,
  body:{itemId:fxItem.id,locationId:yjStorages[0].id,direction:"in",amount:1},
});
assert.equal(crossAdjust.response.status,400);
assert.equal(crossAdjust.data.error,"ITEM_SITE_MISMATCH");

const crossInternal = await request("/api/inventory/transfer",{
  method:"POST",cookie:admin,
  body:{
    itemId:fxItem.id,
    sourceLocationId:yjStorages[0].id,
    destinationLocationId:yjStorages[1].id,
    amount:1,
  },
});
assert.equal(crossInternal.response.status,400);
assert.equal(crossInternal.data.error,"ITEM_SITE_MISMATCH");

const crossRelocate = await request("/api/inventory/relocate-storage",{
  method:"POST",cookie:admin,
  body:{
    itemId:fxItem.id,
    sourceLocationId:fxStorage.id,
    destinationLocationId:yjStorages[0].id,
  },
});
assert.equal(crossRelocate.response.status,400);
assert.equal(crossRelocate.data.error,"RELOCATION_MUST_STAY_IN_SITE");

const crossDirectSource = await request("/api/inventory/direct-transfer",{
  method:"POST",cookie:admin,
  body:{
    itemId:fxItem.id,
    sourceLocationId:yjStorages[0].id,
    destinationLocationId:centralStorage.id,
    quantity:1,
  },
});
assert.equal(crossDirectSource.response.status,400);
assert.equal(crossDirectSource.data.error,"ITEM_SITE_MISMATCH");

const afterYj = await request("/api/inventory/yongji",{cookie:admin});
assert.equal(afterYj.response.status,200);
assert(
  afterYj.data.items.every((item)=>String(item.item_key || "").startsWith("yongji:")),
  "Yongji snapshot leaked an item owned by another site"
);
const yjItemIds = new Set(afterYj.data.items.map((item)=>item.id));
assert(
  afterYj.data.stock.every((row)=>yjItemIds.has(row.item_id)),
  "Yongji snapshot leaked cross-site stock rows"
);

console.log("INVENTORY_SITE_ISOLATION_API_OK");
