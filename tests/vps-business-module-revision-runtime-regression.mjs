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

const requests = [];
let saveNumber = 0;
globalThis.fetch = async (path, options = {}) => {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ path: String(path), method, body });

  if (method === "GET" && String(path) === "/api/business-state/fuxing") {
    return new Response(JSON.stringify({
      site: "fuxing",
      revision: 20,
      modules: { settings: { reservationBuffer: 3 } },
      moduleRevisions: { settings: 11 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (method === "POST" && String(path) === "/api/business-state/fuxing") {
    saveNumber += 1;
    const expected = saveNumber === 1 ? 11 : 12;
    assert.deepEqual(body.expectedModuleRevisions, { settings: expected }, `save ${saveNumber} used wrong expected module revision`);
    return new Response(JSON.stringify({
      ok: true,
      site: "fuxing",
      revision: 20 + saveNumber,
      savedModules: ["settings"],
      moduleRevisions: { settings: expected + 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  throw new Error(`Unexpected request ${method} ${path}`);
};

const runtimeModule = await import(`../src/vps-api.js?revision-runtime=${Date.now()}`);
const { vpsBusinessState, vpsSaveBusinessState } = runtimeModule;
await vpsBusinessState("fuxing");
await vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 4 } });
await vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 5 } });
assert.equal(saveNumber, 2, "transport did not perform both guarded writes");

// Explicit tokens remain supported for focused callers/tests and must be sent unchanged.
let explicitBody = null;
globalThis.fetch = async (_path, options = {}) => {
  explicitBody = JSON.parse(options.body || "{}");
  return new Response(JSON.stringify({
    ok: true,
    savedModules: ["settings"],
    moduleRevisions: { settings: 31 },
    revision: 40,
  }), { status: 200, headers: { "content-type": "application/json" } });
};
await vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 6 } }, { settings: 30 });
assert.deepEqual(explicitBody.expectedModuleRevisions, { settings: 30 });

// A late GET from a previous authenticated user must never replace the revision
// token used by the current user on the same site.
storage.set(AUTH_KEY, JSON.stringify({ id: "user-a" }));
let resolveOldRead = null;
const userScopedPosts = [];
globalThis.fetch = async (path, options = {}) => {
  const method = options.method || "GET";
  if (method === "GET" && String(path) === "/api/business-state/fuxing") {
    const userId = JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.id || "";
    if (userId === "user-a") {
      return new Promise((resolve) => {
        resolveOldRead = () => resolve(new Response(JSON.stringify({
          site: "fuxing",
          revision: 7,
          modules: { settings: { reservationBuffer: 1 } },
          moduleRevisions: { settings: 7 },
        }), { status: 200, headers: { "content-type": "application/json" } }));
      });
    }
    if (userId === "user-b") {
      return new Response(JSON.stringify({
        site: "fuxing",
        revision: 50,
        modules: { settings: { reservationBuffer: 2 } },
        moduleRevisions: { settings: 50 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  }
  if (method === "POST" && String(path) === "/api/business-state/fuxing") {
    const body = JSON.parse(options.body || "{}");
    userScopedPosts.push(body);
    if (body.modules?.attendance) {
      return new Response(JSON.stringify({
        error: "BUSINESS_STATE_REVISION_REQUIRED",
        site: "fuxing",
        missingModules: ["attendance"],
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      site: "fuxing",
      revision: 51,
      savedModules: ["settings"],
      moduleRevisions: { settings: 51 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected user-scope request ${method} ${path}`);
};

const userScopeModule = await import(`../src/vps-api.js?revision-user-scope=${Date.now()}`);
const staleRead = userScopeModule.vpsBusinessState("fuxing");
await new Promise((resolve) => nativeSetTimeout(resolve, 0));
assert.equal(typeof resolveOldRead, "function", "user A GET did not enter the held in-flight state");

storage.set(AUTH_KEY, JSON.stringify({ id: "user-b" }));
const currentRead = await userScopeModule.vpsBusinessState("fuxing");
assert.equal(currentRead.moduleRevisions.settings, 50, "user B did not receive the current module revision");
resolveOldRead();
await staleRead;

await userScopeModule.vpsSaveBusinessState("fuxing", { settings: { reservationBuffer: 3 } });
assert.equal(userScopedPosts.length, 1, "user B save did not issue exactly one POST");
assert.deepEqual(
  userScopedPosts[0].expectedModuleRevisions,
  { settings: 50 },
  "late user A response polluted user B's revision token for the same site"
);

// If the current user's cache has no token for a dirty module, the client must
// omit that token instead of guessing revision 0. The server can then return the
// precise REVISION_REQUIRED response and cannot silently accept an unguarded write.
await assert.rejects(
  () => userScopeModule.vpsSaveBusinessState("fuxing", { attendance: { attendance: [], payroll: {} } }),
  (error) => error?.code === "BUSINESS_STATE_REVISION_REQUIRED" && error?.status === 409
);
assert.deepEqual(
  userScopedPosts.at(-1)?.expectedModuleRevisions,
  {},
  "transport guessed revision 0 for a module whose concurrency token was never loaded"
);

console.log("VPS_BUSINESS_MODULE_REVISION_RUNTIME_OK", requests.length);
console.log("VPS_BUSINESS_REVISION_USER_SCOPE_OK");
console.log("VPS_BUSINESS_MISSING_REVISION_TOKEN_OK");
