import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const importLine = 'import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";';
const injected = source.replace(importLine, `
const isVpsApiConfigured = () => true;
const vpsBusinessState = async () => ({ revision:0, modules:{} });
const vpsSaveBusinessState = async () => ({ ok:true, revision:0, savedModules:[] });
`);
assert.notEqual(injected, source, "recovery metadata test could not inject VPS API mocks");

const RECOVERY_KEY = "shitu-business-recovery-v1";
const storage = new Map([[RECOVERY_KEY, JSON.stringify({
  version: 1,
  drafts: {
    "user-a:fuxing": {
      userId: "user-a",
      site: "fuxing",
      capturedAt: "2026-09-06T04:00:00.000Z",
      baseRevision: 10,
      changedModules: ["settings", "reservations"],
      reason: "authorization-transition",
      modules: { settings: { secret: "MUST_NOT_ESCAPE" } },
    },
    "user-b:yongji": {
      userId: "user-b",
      site: "yongji",
      capturedAt: "2026-09-06T05:00:00.000Z",
      changedModules: ["sop"],
      reason: "authorization-transition",
      modules: { sop: { secret: "FOREIGN_PAYLOAD" } },
    },
  },
})]]);
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { businessRecoveryMetadataForUser } = await import(moduleUrl);
assert.equal(typeof businessRecoveryMetadataForUser, "function", "business-state recovery metadata helper is missing");

const own = businessRecoveryMetadataForUser("user-a");
assert.equal(own.length, 1, "metadata helper did not isolate the requested user");
assert.equal(own[0].site, "fuxing");
assert.deepEqual(own[0].changedModules, ["settings", "reservations"]);
assert.equal(own[0].baseRevision, 10);
assert.equal(own[0].reason, "authorization-transition");
assert.equal(Object.hasOwn(own[0], "modules"), false, "metadata helper leaked recovery module payloads to the UI boundary");
assert.doesNotMatch(JSON.stringify(own), /MUST_NOT_ESCAPE|FOREIGN_PAYLOAD/, "metadata helper leaked recovery payload content");

assert.deepEqual(businessRecoveryMetadataForUser("missing-user"), [], "metadata helper returned drafts for an unrelated user");
assert.deepEqual(businessRecoveryMetadataForUser(""), [], "metadata helper should require an explicit user id");

console.log("BUSINESS_RECOVERY_METADATA_OK");
