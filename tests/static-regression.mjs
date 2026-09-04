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

assert.equal(read("vps-entry.html"), read("index.html"), "Legacy entry must match the canonical application shell");
const caddy = read("vps/Caddyfile");
assert.doesNotMatch(caddy, /redir\s+@root\s+\/vps-entry\.html/, "canonical root must not redirect to a versioned legacy URL");
assert.match(caddy, /@legacyEntry[\s\S]{0,180}redir\s+@legacyEntry\s+\/\s+308/, "legacy VPS entry must redirect permanently to the root URL");
assert.match(caddy, /@appAssets[\s\S]{0,160}no-cache, must-revalidate/, "frontend assets must revalidate without manual release URLs");
for (const shell of ["index.html", "vps-entry.html"]) {
  assert.match(read(shell), /meta name="kitchen-release" content="__KITCHEN_RELEASE__"/, `${shell} must expose the deployed release`);
  assert.match(read(shell), /src\/app\.js\?v=__KITCHEN_RELEASE__/, `${shell} must cache-bust the application bundle internally`);
}
const deployScript = read("vps/scripts/deploy-api.sh");
const releaseStamper = read("vps/scripts/stamp-frontend-release.mjs");
assert.match(deployScript, /stamp-frontend-release\.mjs/, "deployment must stamp frontend assets with the Git release");
assert.match(releaseStamper, /replaceAll\("__KITCHEN_RELEASE__", release\)/, "release stamper must replace every frontend placeholder");
assert.match(read("src/cache-reset.js"), /shitu-kitchen-sw-cleanup-\$\{RELEASE\}/, "service-worker cleanup must rerun for every deployed release");

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
assert.match(app, /function renderWhenAuthorized\(\)/, "application rendering must wait for VPS authentication");
assert.match(app, /event\.detail\?\.status === "synced"\) return/, "unchanged inventory polls must not rerender the full page");
assert.match(app, /shitu:inventory-cloud-updated/, "actual inventory changes must still refresh the page");
assert.doesNotMatch(read("src/auth-layer.js"), /data-warehouse[\s\S]{0,500}location\.reload\(\)/, "switching warehouses must not reload the entire application");

const accountAdmin = read("src/account-admin.js");
const authBridge = read("src/vps-auth-bridge.js");
assert.match(accountAdmin, /name="password" type="password" minlength="10"/, "account editor must enforce the password policy");
assert.match(accountAdmin, /PERMISSION_MODULES\.map/, "account editor must render all module permissions");
assert.match(accountAdmin, /PERMISSION_MODULES = \['dashboard'/, "account editor must pin dashboard as the first permission");
assert.match(authBridge, /PERMISSION_MODULES = \["dashboard"/, "cloud/VPS submit bridge must persist dashboard permission");
assert.match(authBridge, /dataset\.vpsAuthReady = "checking"/, "VPS auth must gate the initial application render");
assert.match(authBridge, /shitu:vps-auth-ready/, "VPS auth must release the application after verification");
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
assert.match(authLayer, /function centralPage[\s\S]{0,900}const historical = false;/, "central inventory must remain live across service dates");
assert.doesNotMatch(authLayer, /function centralPage[\s\S]{0,900}const historical = !isCurrentBranchInventoryDate\(\)/, "central inventory must not inherit the branch historical-date lock");
assert.match(authLayer, /const operationsEnabled = editGranted && cloudReady;/, "central operation tabs must stay available whenever permission and VPS are ready");
assert.match(authLayer, /const canManageCatalog = catalogManageVisible && canManageCentralCatalog\(\);/, "central management must not be locked by service date");
assert(app.includes("data-save-item"), "branch product editor must expose an explicit save button");
assert(authLayer.includes("data-central-save-item"), "central product editor must expose an explicit save button");
assert(app.includes('class="secondary-button modal-header-save"'), "branch save action must remain visible in the modal header");
assert(authLayer.includes('class="secondary-button modal-header-save"'), "central save action must remain visible in the modal header");
assert.match(authLayer, /inventoryCloudState\(\) !== "ready"[\s\S]{0,250}品項尚未儲存/, "central catalog must reject local-only saves");
assert(app.includes("attachBusinessStateSync(store)"), "business modules must synchronize with PostgreSQL");
const inventoryCloud = read("src/inventory-cloud.js");
assert.match(inventoryCloud, /cloudSyncBranchCatalogItem[\s\S]{0,300}canManageBranchCatalog\(site\)/, "inventory editors must be allowed to save branch catalog items");
const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const businessSync = read("src/business-state-sync.js");
for (const moduleName of ["settings","reservations","procurement","preparation","menu","sop","skills","attendance","schedule","remote","shared","audit"]) {
  assert(businessRoutes.includes(`${moduleName}:`), `business-state route missing ${moduleName}`);
}
assert.match(businessSync, /remote:\s*\{\s*jobCatalog:/, "remote job catalog must persist under remote permission");
assert(!/revision\s*\|\|\s*0\)\s*>\s*0[\s\S]{0,500}else if\s*\(hasBusinessEdit\(\)\)\s*\{\s*await save\(\)/.test(businessSync), "an empty server must not be seeded by an untouched clean browser");
assert(!businessSync.includes("store.resetBusinessModules()"), "partial server state must not erase business modules that still exist only on the device");

console.log("STATIC_REGRESSION_OK");
