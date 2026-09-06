import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("receiving-default API regression passed");
