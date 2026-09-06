import assert from "node:assert/strict";

const nativeSetTimeout = globalThis.setTimeout;
globalThis.window = {
  location: { hostname: "localhost", protocol: "http:" },
  setTimeout: nativeSetTimeout,
  dispatchEvent() {},
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
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

const { vpsBusinessState, vpsSaveBusinessState } = await import(`../src/vps-api.js?revision-runtime=${Date.now()}`);
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

console.log("VPS_BUSINESS_MODULE_REVISION_RUNTIME_OK", requests.length);
