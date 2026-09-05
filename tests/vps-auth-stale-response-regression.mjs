import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "src/vps-auth-bridge.js"), "utf8");
const apiImport = /import \{[\s\S]*?\} from "\.\/vps-api\.js";/;
const permissionsImport = 'import { ACCOUNT_MODULES, normalizeAccountPermissions } from "./account-permissions.js";';
let injected = source
  .replace(apiImport, `
const vpsChangePassword = async () => ({});
const vpsDeleteUser = async () => ({});
const vpsListUsers = async () => ({ users: [] });
const vpsLogin = async () => ({});
const vpsLogout = async () => ({});
const vpsMe = (...args) => globalThis.__authGenerationVpsMe(...args);
const vpsSaveUser = async () => ({});
`)
  .replace(permissionsImport, `
const ACCOUNT_MODULES = [];
const normalizeAccountPermissions = (_role, permissions) => permissions || {};
`)
  .replace(/\nvoid boot\(\);\s*$/, '\nexport { currentVpsUser, invalidateCurrentVpsUser };\n');
assert.notEqual(injected, source, "auth generation test could not inject VPS API mocks");

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
class TestCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}
globalThis.CustomEvent = TestCustomEvent;
globalThis.location = { hostname: "test.local", pathname: "/" };
globalThis.history = { replaceState() {} };
globalThis.fetch = async () => ({ ok: true });
globalThis.confirm = () => true;
globalThis.alert = () => {};
globalThis.HTMLFormElement = class {};
globalThis.FormData = class {};
const noop = () => {};
globalThis.window = {
  addEventListener: noop,
  dispatchEvent() { return true; },
};
globalThis.document = {
  documentElement: { dataset: {} },
  visibilityState: "visible",
  addEventListener: noop,
  querySelector() { return null; },
  createElement() { return { id: "", innerHTML: "" }; },
  body: {
    classList: { add: noop, remove: noop },
    append: noop,
  },
};

const requests = [];
globalThis.__authGenerationVpsMe = () => new Promise((resolve) => requests.push(resolve));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(injected).toString("base64")}`;
const { currentVpsUser, invalidateCurrentVpsUser } = await import(moduleUrl);

const first = currentVpsUser();
assert.equal(requests.length, 1, "first auth profile request did not start");
invalidateCurrentVpsUser();
const second = currentVpsUser();
assert.equal(requests.length, 2, "new auth generation reused a stale in-flight request");

requests[0]({ user: { id: "user-a" } });
await assert.rejects(first, (error) => error?.code === "STALE_AUTH_CHECK", "stale auth response was not rejected");
requests[1]({ user: { id: "user-b" } });
const fresh = await second;
assert.equal(fresh?.user?.id, "user-b", "fresh auth generation did not return the current profile");

console.log("VPS_AUTH_STALE_RESPONSE_OK");
