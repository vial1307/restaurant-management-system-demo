import assert from "node:assert/strict";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

globalThis.window = {
  location: { hostname: "test.local", protocol: "https:" },
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  dispatchEvent() { return true; },
};
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return String(name).toLowerCase() === "content-type" ? "application/json" : ""; } },
    async json() { return data; },
    async text() { return JSON.stringify(data); },
  };
}

let resolveOldRead = null;
const postedBodies = [];
globalThis.fetch = async (path, options = {}) => {
  const method = options.method || "GET";
  if (method === "GET" && path === "/api/business-state/fuxing") {
    const userId = JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.id || "";
    if (userId === "user-a") {
      return new Promise((resolve) => {
        resolveOldRead = () => resolve(jsonResponse({
          site: "fuxing",
          revision: 7,
          moduleRevisions: { settings: 7 },
          modules: { settings: { reservationBuffer: 1 } },
        }));
      });
    }
    if (userId === "user-b") {
      return jsonResponse({
        site: "fuxing",
        revision: 20,
        moduleRevisions: { settings: 20 },
        modules: { settings: { reservationBuffer: 2 } },
      });
    }
  }
  if (method === "POST" && path === "/api/business-state/fuxing") {
    const body = JSON.parse(options.body || "{}");
    postedBodies.push(body);
    return jsonResponse({
      ok: true,
      site: "fuxing",
      savedModules: ["settings"],
      moduleRevisions: { settings: 21 },
      revision: 21,
    });
  }
  throw new Error(`Unexpected request ${method} ${path}`);
};

storage.set(AUTH_KEY, JSON.stringify({ id: "user-a" }));
const { vpsBusinessState, vpsSaveBusinessState } = await import("../src/vps-api.js");

const staleRead = vpsBusinessState("fuxing");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(typeof resolveOldRead, "function", "user A business-state GET did not enter the held in-flight state");

storage.set(AUTH_KEY, JSON.stringify({ id: "user-b" }));
const currentRead = await vpsBusinessState("fuxing");
assert.equal(currentRead.moduleRevisions.settings, 20, "user B did not receive its authoritative module revision");

resolveOldRead();
const oldResult = await staleRead;
assert.equal(oldResult.moduleRevisions.settings, 7, "held user A response fixture did not resolve as expected");

await vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 3 } });
assert.equal(postedBodies.length, 1, "user B save did not issue exactly one business-state POST");
assert.deepEqual(
  postedBodies[0].expectedModuleRevisions,
  { settings: 20 },
  "stale response from user A polluted user B's revision token for the same site"
);

console.log("VPS_BUSINESS_REVISION_USER_SCOPE_OK");
