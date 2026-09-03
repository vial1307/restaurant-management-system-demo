import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_MODULES,
  fullAccountPermissions,
  normalizeAccountPermissions,
} from "../src/account-permissions.js";
import {
  ACCOUNT_MODULES as BACKEND_MODULES,
  fullPermissions as backendFullPermissions,
  normalizeLocationForRole,
} from "../vps/backend/src/permissions.mjs";
import { searchMatches } from "../src/search-utils.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

assert.equal(read("vps-entry.html"), read("index.html"), "VPS cache-busting entry must match the application shell");

assert.deepEqual(BACKEND_MODULES, ACCOUNT_MODULES, "frontend/backend account module lists diverged");
assert.deepEqual(backendFullPermissions(), fullAccountPermissions(), "frontend/backend admin permissions diverged");
assert.equal(normalizeLocationForRole("admin", "fuxing"), "all");
assert.equal(normalizeLocationForRole("central", "fuxing"), "central");
assert.equal(normalizeLocationForRole("manager", "yongji"), "yongji");

const poisonedAdmin = Object.fromEntries(
  ACCOUNT_MODULES.map((key) => [key, { view: false, edit: false }])
);
const normalizedAdmin = normalizeAccountPermissions("admin", poisonedAdmin);
for (const key of ACCOUNT_MODULES) {
  assert.equal(normalizedAdmin[key]?.view, true, `admin must view ${key}`);
  assert.equal(normalizedAdmin[key]?.edit, true, `admin must edit ${key}`);
}

const app = read("src/app.js");
const routeMatch = app.match(/const ROUTES\s*=\s*\[([^\]]+)\]/);
assert(routeMatch, "ROUTES list not found");
const routes = [...routeMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(routes, ACCOUNT_MODULES, "navigation routes diverged from account modules");
assert(ACCOUNT_MODULES.includes("dashboard"), "dashboard must be available in account permissions");

const uiFiles = [
  "src/app.js",
  "src/management.js",
  "src/auth-layer.js",
  "src/inventory-operations.js",
  "src/account-admin.js",
];
const uiSource = uiFiles.map(read).join("\n");
const emittedActions = new Set([...uiSource.matchAll(/data-action=["'`]([^"'\`$<>{}\s]+)["'`]/g)].map((m) => m[1]));
const handledActions = new Set([...uiSource.matchAll(/action\s*===\s*["']([^"']+)["']/g)].map((m) => m[1]));
const dynamicHandled = new Set([
  "select-zone",
  "select-work-area",
  "open-edit-item",
  "inventory-edit-sql-pending",
  "adjust-item",
  "adjust-work-item",
  "toggle-language",
]);
const missingActions = [...emittedActions].filter((action) => !handledActions.has(action) && !dynamicHandled.has(action));
assert.deepEqual(missingActions, [], `buttons without handlers: ${missingActions.join(", ")}`);

const emittedFields = new Set([...uiSource.matchAll(/data-field=["'`]([^"'\`$<>{}\s]+)["'`]/g)].map((m) => m[1]));
const handledFields = new Set([...uiSource.matchAll(/field\s*===\s*["']([^"']+)["']/g)].map((m) => m[1]));
const missingFields = [...emittedFields].filter((field) => !handledFields.has(field));
assert.deepEqual(missingFields, [], `fields without handlers: ${missingFields.join(", ")}`);

assert.equal(searchMatches("大冷凍", ""), true);
assert.equal(searchMatches("大冷凍", "da leng dong"), true);
assert.equal(searchMatches("牛肉", "niu rou"), true);
assert.equal(searchMatches("牛肉", "ㄋㄧㄡㄖㄡ"), true);
assert.equal(searchMatches("Thịt bò", "thit bo"), true);
assert.equal(searchMatches("永吉店", "yongji"), true);
assert.equal(searchMatches("麻辣湯", "malatang"), true);

for (const [file, marker] of [
  ["src/app.js", 'data-field="inventorySearch"'],
  ["src/auth-layer.js", "data-central-search"],
  ["src/inventory-operations.js", "data-op-search"],
]) {
  const source = read(file);
  assert(source.includes(marker), `${file} missing search marker`);
  assert(source.includes("compositionend") || source.includes("oncompositionend"), `${file} missing IME composition handling`);
}

assert(!/function applyInventorySearchDom[\s\S]{0,2500}render\(\)/.test(app), "inventory search must not rerender the page while typing");

const accountAdmin = read("src/account-admin.js");
const authBridge = read("src/vps-auth-bridge.js");
assert.match(accountAdmin, /name="password" type="password" minlength="10"/, "account editor must enforce the password policy");
assert.match(accountAdmin, /PERMISSION_MODULES\.map/, "account editor must render all module permissions");
assert.match(accountAdmin, /PERMISSION_MODULES = \['dashboard'/, "account editor must pin dashboard as the first permission");
assert.match(authBridge, /PERMISSION_MODULES = \["dashboard"/, "cloud/VPS submit bridge must persist dashboard permission");
assert.match(accountAdmin, /vpsAccountStorage/, "VPS account panel must identify PostgreSQL storage");
for (const runtimeFile of ["index.html", "vps-entry.html", ...fs.readdirSync(path.join(ROOT, "src")).filter((name) => name.endsWith(".js")).map((name) => `src/${name}`)]) {
  assert(!/supabase/i.test(read(runtimeFile)), `${runtimeFile} still contains a Supabase runtime dependency`);
}
const retirementWorker = read("sw.js");
assert.match(retirementWorker, /registration\.unregister\(\)/, "retirement worker must unregister the old offline worker");
assert.match(retirementWorker, /caches\.delete/, "retirement worker must delete old Kitchen OS caches");
assert.match(app, /route\(\) === "dashboard" && !accountCan\("dashboard", "edit"\)/, "dashboard task edits must enforce dashboard edit permission");

const authLayer = read("src/auth-layer.js");
for (const marker of [
  'class="central-tabs branch-ops-tabs"',
  'class="inventory-view-switch"',
  'data-central-view="storage"',
  'data-central-view="work"',
  'data-central-mode="manage"',
]) assert(authLayer.includes(marker), `central inventory missing shared branch UI marker: ${marker}`);
for (const mode of ["in", "pick", "transfer", "ship"]) {
  assert(authLayer.includes(`data-central-mode="${mode}"`), `central inventory missing ${mode} operation`);
}
assert(app.includes('data-manage-adjust="true"'), "branch management must expose quantity controls");
assert(authLayer.includes('data-central-manage-adjust="true"'), "central management must expose quantity controls");

console.log("STATIC_REGRESSION_OK");
