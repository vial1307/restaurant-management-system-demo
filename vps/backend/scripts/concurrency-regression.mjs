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
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `missing session cookie for ${username}`);
  return result.cookie;
}

const [adminCookie, employeeCookie, supervisorCookie] = await Promise.all([
  login("yangchuadmin"),
  login("employeefx"),
  login("supervisorfx"),
]);

// Inventory must serialize concurrent mutations to the same stock row. A lost
// update here would make two real users' simultaneous inbound operations erase
// one another even though both requests returned success.
const inventory = await request("/api/inventory/fuxing", { cookie:adminCookie });
assert.equal(inventory.response.status, 200);
const beef = inventory.data.items.find((item) => item.catalog_key === "beef");
const freezer = inventory.data.locations.find((location) => location.code === "fuxing-freezer");
assert(beef && freezer, "concurrency fixture beef/freezer missing");

const baseline = 50;
const reset = await request("/api/inventory/set-quantity", {
  method:"POST",
  cookie:adminCookie,
  body:{ itemId:beef.id, locationId:freezer.id, quantity:baseline },
});
assert.equal(reset.response.status, 200, `failed to prepare concurrency stock: ${JSON.stringify(reset.data)}`);

const mutationCount = 12;
const mutations = await Promise.all(
  Array.from({ length:mutationCount }, (_, index) => request("/api/inventory/adjust", {
    method:"POST",
    cookie:index % 2 === 0 ? employeeCookie : supervisorCookie,
    body:{
      itemId:beef.id,
      locationId:freezer.id,
      direction:"in",
      amount:1,
      note:`multi-user-concurrency-${index}`,
    },
  }))
);
for (const [index, result] of mutations.entries()) {
  assert.equal(result.response.status, 200, `concurrent inventory mutation ${index} failed: ${JSON.stringify(result.data)}`);
}

const afterInventory = await request("/api/inventory/fuxing", { cookie:adminCookie });
const finalRow = afterInventory.data.stock.find((row) => row.item_id === beef.id && row.location_id === freezer.id);
assert(finalRow, "final concurrency stock row missing");
assert.equal(Number(finalRow.quantity), baseline + mutationCount, "concurrent inventory writes lost one or more increments");

const history = await request("/api/inventory/fuxing/transactions?limit=100", { cookie:adminCookie });
assert.equal(history.response.status, 200);
const concurrentTransactions = history.data.transactions.filter((tx) => String(tx.note || "").startsWith("multi-user-concurrency-"));
assert.equal(concurrentTransactions.length, mutationCount, "not every concurrent inventory operation produced an audit transaction");
assert(concurrentTransactions.some((tx) => tx.actor_username === "employeefx"), "employee actor missing from concurrent audit history");
assert(concurrentTransactions.some((tx) => tx.actor_username === "supervisorfx"), "supervisor actor missing from concurrent audit history");

// Distinct business modules saved at the same time must both survive. The
// server locks the site row, re-reads current modules and merges only modules
// the authenticated user is allowed to edit.
const businessWrites = await Promise.all([
  request("/api/business-state/fuxing", {
    method:"POST",
    cookie:adminCookie,
    body:{ modules:{ settings:{ concurrencyMarker:"admin-settings-write" } } },
  }),
  request("/api/business-state/fuxing", {
    method:"POST",
    cookie:employeeCookie,
    body:{ modules:{ attendance:{
      attendance:[{ id:"concurrency-attendance", employeeId:"staff-concurrency", clockIn:"2026-09-05T00:00:00.000Z" }],
      payroll:{ concurrencyMarker:"employee-attendance-write" },
    } } },
  }),
]);
for (const [index, result] of businessWrites.entries()) {
  assert.equal(result.response.status, 200, `concurrent business-state write ${index} failed: ${JSON.stringify(result.data)}`);
}

const sharedState = await request("/api/business-state/fuxing", { cookie:adminCookie });
assert.equal(sharedState.response.status, 200);
assert.equal(sharedState.data.modules.settings?.concurrencyMarker, "admin-settings-write", "concurrent settings module was overwritten");
assert.equal(sharedState.data.modules.attendance?.payroll?.concurrencyMarker, "employee-attendance-write", "concurrent attendance module was overwritten");

// Read fan-out is a lightweight CI safety check for the current DB pool. It is
// deliberately not a production stress test.
const fanout = await Promise.all(
  Array.from({ length:30 }, (_, index) => request("/api/inventory/fuxing", {
    cookie:index % 2 === 0 ? employeeCookie : supervisorCookie,
  }))
);
assert(fanout.every((result) => result.response.status === 200), "concurrent inventory read fan-out returned an error");

console.log("MULTI_USER_CONCURRENCY_OK", JSON.stringify({
  inventoryMutations:mutationCount,
  finalQuantity:Number(finalRow.quantity),
  concurrentReads:fanout.length,
}));
