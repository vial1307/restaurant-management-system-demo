import assert from "node:assert/strict";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const nativeSetTimeout = globalThis.setTimeout;
const storage = new Map([[AUTH_KEY, JSON.stringify({ id: "revision-user" })]]);
globalThis.window = {
  location: { hostname: "localhost", protocol: "http:" },
  setTimeout: nativeSetTimeout,
  clearTimeout: globalThis.clearTimeout,
  dispatchEvent() {},
};
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const posts = [];
let acceptedSave = 0;
globalThis.fetch = async (path, options = {}) => {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;

  if (method === "GET" && String(path) === "/api/business-state/fuxing") {
    return new Response(JSON.stringify({
      site: "fuxing",
      revision: 20,
      modules: { settings: { reservationBuffer: 3 } },
      moduleRevisions: { settings: 11 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (method === "POST" && String(path) === "/api/business-state/fuxing") {
    posts.push(body);
    const expected = body?.expectedModuleRevisions || {};
    if (!Number.isInteger(expected.settings)) {
      return new Response(JSON.stringify({
        error: "BUSINESS_STATE_REVISION_REQUIRED",
        site: "fuxing",
        missingModules: ["settings"],
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    acceptedSave += 1;
    return new Response(JSON.stringify({
      ok: true,
      site: "fuxing",
      revision: 20 + acceptedSave,
      savedModules: ["settings"],
      moduleRevisions: { settings: expected.settings + 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  throw new Error(`Unexpected request ${method} ${path}`);
};

const { vpsBusinessState, vpsSaveBusinessState } = await import(`../src/vps-api.js?revision-runtime=${Date.now()}`);
const read = await vpsBusinessState("fuxing");
assert.equal(read.moduleRevisions.settings, 11, "transport did not return server module revision metadata");

// GET metadata must not become a hidden transport cache. Only the synchronization
// layer may decide that a read was actually accepted as its local baseline.
await assert.rejects(
  () => vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 4 } }),
  (error) => error?.code === "BUSINESS_STATE_REVISION_REQUIRED" && error?.status === 409
);
assert.deepEqual(posts[0].expectedModuleRevisions, {}, "transport silently reused a GET token that sync never accepted");

const first = await vpsSaveBusinessState(
  "fuxing",
  { settings: { reservationBuffer: 4 } },
  { settings: read.moduleRevisions.settings }
);
assert.deepEqual(posts[1].expectedModuleRevisions, { settings: 11 }, "explicit accepted token was not sent unchanged");
assert.equal(first.moduleRevisions.settings, 12);

const second = await vpsSaveBusinessState(
  "fuxing",
  { settings: { reservationBuffer: 5 } },
  { settings: first.moduleRevisions.settings }
);
assert.deepEqual(posts[2].expectedModuleRevisions, { settings: 12 }, "confirmed token was not reusable by the sync owner");
assert.equal(second.moduleRevisions.settings, 13);
assert.equal(acceptedSave, 2);

console.log("VPS_BUSINESS_MODULE_REVISION_RUNTIME_OK");
console.log("VPS_BUSINESS_TRANSPORT_STATELESS_OK");
