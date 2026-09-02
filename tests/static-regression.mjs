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
assert.match(accountAdmin, /name="password" type="password" minlength="10"/, "account editor must enforce the password policy");

console.log("STATIC_REGRESSION_OK");
