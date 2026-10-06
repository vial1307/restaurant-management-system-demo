import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_MODULES,
  accountCan,
  accountCanBusinessAction,
  fullAccountPermissions,
  normalizeAccountPermissions,
} from "../src/account-permissions.js";
import {
  ACCOUNT_MODULES as BACKEND_MODULES,
  fullPermissions as backendFullPermissions,
  normalizeLocationForRole,
} from "../vps/backend/src/permissions.mjs";
import { searchMatches } from "../src/search-utils.js";
import "./system-port-regression.mjs";
import "./inventory-master-data-regression.mjs";
import "./inventory-replenishment-policy-regression.mjs";
import "./inventory-hydration-authority-regression.mjs";
import "./inventory-site-isolation-contract-regression.mjs";
import "./super-admin-inventory-lifecycle-contract-regression.mjs";
import "./admin-inventory-database-contract-regression.mjs";
import "./live-handoff-contract-regression.mjs";
import "./inventory-minimum-history-contract-regression.mjs";
import "./inventory-receive-default-audit-contract-regression.mjs";
import "./inventory-catalog-audit-contract-regression.mjs";
import "./inventory-edit-roundtrip-performance-contract-regression.mjs";
import "./inventory-live-edit-realtime-contract-regression.mjs";
import "./browser-page-error-policy-regression.mjs";
import "./central-kitchen-ui-regression.mjs";

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

const failClosedManager = normalizeAccountPermissions("manager", null);
for (const key of ACCOUNT_MODULES) {
  assert.equal(failClosedManager[key]?.view, false, `missing DB permission must not grant manager view on ${key}`);
  assert.equal(failClosedManager[key]?.edit, false, `missing DB permission must not grant manager edit on ${key}`);
}
const partialManager = normalizeAccountPermissions("manager", {
  inventory:{ view:true, edit:true },
  sop:{ view:true, edit:false },
});
assert.equal(partialManager.inventory.view, true);
assert.equal(partialManager.inventory.edit, true);
assert.equal(partialManager.sop.view, true);
assert.equal(partialManager.sop.edit, false);
assert.equal(partialManager.dashboard.view, false, "unspecified modules must remain denied");
assert.equal(accountCan({ accountRole:"manager", permissions:{} }, "inventory", "view"), false,
  "role name alone must not grant frontend permissions");
assert.equal(accountCan({ accountRole:"manager", permissions:{inventory:{view:true,edit:false}} }, "inventory", "view"), true);
assert.equal(accountCan({ accountRole:"manager", permissions:{inventory:{view:true,edit:false}} }, "inventory", "edit"), false);
assert.equal(accountCanBusinessAction({ accountRole:"manager", permissions:{sop:{view:true,edit:true}} }, "sop:edit"), true);
assert.equal(accountCanBusinessAction({ accountRole:"manager", permissions:{} }, "sop:edit"), false);

const accountPermissionsSource = read("src/account-permissions.js");
const accountAdminSource = read("src/account-admin.js");
const operationsSource = read("src/operations.js");
const storeCoreSource = read("src/store-core.js");
const managementSource = read("src/management.js");
const productionUiSmokeSource = read("tests/production-ui-smoke.mjs");
const inventoryCrossSurfaceSource = read("tests/inventory-cross-surface-browser-regression.mjs");

assert.match(
  productionUiSmokeSource,
  /url\.pathname === "\/api\/inventory\/access"[\s\S]{0,700}inventoryAccess\(/,
  "production UI smoke must mock the database-driven Inventory access snapshot"
);
assert.match(
  productionUiSmokeSource,
  /inventory\.product\.create[\s\S]{0,500}inventory\.history\.full/,
  "production UI smoke must grant the granular Inventory actions needed to certify the branch operation tabs"
);
assert.match(
  inventoryCrossSurfaceSource,
  /const closeBranchEditor=async\(\)=>[\s\S]{0,700}querySelector\('\.ingredient-modal \.icon-button\[data-action="close-modal"\]'\)\?\.click\(\)/,
  "cross-surface regression must close the current rerendered Inventory editor atomically"
);

assert.doesNotMatch(accountPermissionsSource, /ACCOUNT_ROLE_DEFAULTS/,
  "frontend permissions must not contain source-coded role grants");
assert.doesNotMatch(accountAdminSource, /ACCOUNT_ROLE_DEFAULTS/,
  "account editor must not restore source-coded role permission templates");
assert.doesNotMatch(operationsSource, /ROLE_PERMISSIONS/,
  "staff role names must not grant browser capabilities");
assert.match(operationsSource, /export function roleCan\(_role, _permission\)[\s\S]{0,180}return false/,
  "legacy granular roleCan compatibility must fail closed");

for (const marker of [
  "DEFAULT_ITEMS",
  "LARGE_FREEZER_SHEET_ITEMS",
  "STOCK_KEYS",
  "inferWorkArea",
  "export const WORK_AREAS",
  "export const ZONES",
  "export const PRIMARY_ZONES",
]) {
  assert.equal(storeCoreSource.includes(marker), false,
    `store-core must not retain legacy inventory master data: ${marker}`);
}
assert.doesNotMatch(storeCoreSource, /"large-freezer"|"large-fridge"|"four-door"/,
  "store-core must not depend on legacy storage location identities");
assert.match(storeCoreSource, /createDefaultRecord\(date, inventory = \[\], workInventory = \[\]\)/,
  "new browser records must start with no inventory until PostgreSQL hydration");
assert.match(storeCoreSource, /export function buildWorkInventory\(_inventory = \[\]\) \{\s*return \[\];/,
  "browser storage rows must never synthesize Work Area stock");
assert.doesNotMatch(storeCoreSource, /workArea:[^\n]{0,100}\|\|\s*"(?:noodles|soup|seafood|meat)"/,
  "store hydration must not infer a source-coded Work Area fallback");
assert.doesNotMatch(read("src/app.js"), /\bWORK_AREAS\b/,
  "application Work Area choices must not come from legacy store constants");
assert.doesNotMatch(managementSource, /\bWORK_AREAS\b|\bZONES\b/,
  "management Work Area choices must use the database-backed resolver");

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
const authLayerSwitching = read("src/auth-layer.js");
assert.match(authLayerSwitching, /document\.addEventListener\("pointerdown", activateWarehouseFromEvent, \{ capture:true \}\)/, "warehouse switching must capture pointer activation before rerender can replace the button");
assert.match(authLayerSwitching, /document\.addEventListener\("click", activateWarehouseFromEvent, \{ capture:true \}\)/, "warehouse switching must retain capture-phase click activation for keyboard/accessibility");
assert.match(authLayerSwitching, /warehousePointerActivation[\s\S]{0,700}Date\.now\(\) - warehousePointerActivation\.at < 1200/, "warehouse switching must deduplicate pointerdown followed by click");
assert.doesNotMatch(authLayerSwitching, /content\.querySelectorAll\("\[data-warehouse\]"\)\.forEach\(b => b\.onclick/, "central warehouse buttons must not rely on transient per-node onclick bindings");
assert.doesNotMatch(authLayerSwitching, /heading\.querySelectorAll\("\[data-warehouse\]"\)\.forEach[\s\S]{0,180}addEventListener\("click"/, "branch warehouse buttons must not rely on post-render per-node click bindings");

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
assert.match(authLayer, /class="central-tabs branch-ops-tabs[^"]*"/, "central inventory must preserve shared branch operation tab classes");
for (const marker of [
  'class="inventory-view-switch"',
  'data-central-view="storage"',
  'data-central-view="work"',
]) assert(authLayer.includes(marker), `central inventory missing shared branch UI marker: ${marker}`);
for (const mode of ["overview", "in", "pick", "transfer", "ship", "manage", "history"]) {
  assert(
    authLayer.includes(`id:"${mode}"`) || authLayer.includes(`data-central-mode="${mode}"`),
    `central inventory missing ${mode} mode`,
  );
}
assert(app.includes('data-manage-adjust="true"'), "branch management must expose quantity controls");
assert(authLayer.includes('data-central-manage-adjust="true"'), "central management must expose quantity controls");
const centralPageSource = authLayer.slice(authLayer.indexOf("function centralPage"), authLayer.indexOf("function centralStockStatus"));
assert(centralPageSource.includes("function centralPage"), "centralPage source block missing");
assert.doesNotMatch(centralPageSource, /isCurrentBranchInventoryDate\(/, "central inventory must remain live across service dates and must not inherit branch date locks");
assert.match(authLayer, /const operationsEnabled = editGranted && cloudReady;/, "central operation tabs must stay available whenever permission and VPS are ready");
assert.match(authLayer, /if \(!document\.querySelector\("\[data-central-kitchen-shell\]"\)\) centralPage\(user\);/, "Central auth observer must detect the redesigned shell and avoid rerender loops");
assert.match(app, /shitu:inventory-cloud-updated[\s\S]{0,520}activeRoute === "inventory"[\s\S]{0,160}document\.querySelector\("\[data-central-kitchen-shell\]"\)/, "branch inventory update listener must not rerender the redesigned Central shell");
assert.match(app, /INVENTORY_REACTIVE_ROUTES = new Set\(\["dashboard","inventory","procurement","preparation"\]\)/, "Inventory realtime rerenders must remain isolated from Schedule and other unrelated forms");
assert.match(app, /shitu:inventory-cloud-status[\s\S]{0,220}!document\.querySelector\("\[data-central-kitchen-shell\]"\)/, "branch cloud-status listener must not rerender the redesigned Central shell");
assert.match(authLayer, /shitu:inventory-cloud-status[\s\S]{0,420}preserveInventoryEditor\(document\.querySelector\('\[data-central-editor-form\]'\)\)/, "Central cloud-status refresh must preserve dirty editor drafts");
assert.match(authLayer, /const canManageCatalog = catalogManageVisible && canManageCentralCatalog\(\);/, "central management must not be locked by service date");
assert(app.includes("data-save-item"), "branch product editor must expose an explicit save button");
assert(authLayer.includes("data-central-save-item"), "central product editor must expose an explicit save button");
assert(app.includes('class="secondary-button modal-header-save"'), "branch save action must remain visible in the modal header");
assert(authLayer.includes('class="secondary-button modal-header-save"'), "central save action must remain visible in the modal header");
assert.match(authLayer, /inventoryCloudState\(\) !== "ready"[\s\S]{0,250}品項尚未儲存/, "central catalog must reject local-only saves");
assert(app.includes("attachBusinessStateSync(store)"), "business modules must synchronize with PostgreSQL");
const inventoryCloud = read("src/inventory-cloud.js");
const inventoryRealtime = read("vps/backend/src/inventory-realtime.mjs");
const superAdminPanel = read("src/admin-panel.js");
const inventoryDatabase = read("src/admin-inventory-database.js");
assert.match(inventoryCloud, /cloudSyncBranchCatalogItem[\s\S]{0,300}canManageBranchCatalog\(site\)/, "inventory editors must be allowed to save branch catalog items");
assert.match(inventoryRealtime, /route === "\/api\/admin\/super\/sites"[\s\S]{0,220}publishSiteRegistryInvalidation/, "site master-data writes must publish a dedicated site-registry realtime event");
assert.match(inventoryCloud, /addEventListener\("site-registry"[\s\S]{0,700}refreshInventorySiteRegistry/, "website inventory sessions must refresh the database site registry in realtime");
assert.match(inventoryCloud, /refreshInventorySiteRegistry[\s\S]{0,1100}shitu:inventory-sites-changed/, "site registry refresh must notify the website UI after PostgreSQL-backed changes");
assert.match(inventoryCloud, /const activeChanged = previousSite !== site;[\s\S]{0,280}hydrateActive && site && activeChanged/, "unrelated site-registry edits must not force a full active-site inventory reload");
assert.match(inventoryCloud, /siteRegistryUserId[\s\S]{0,1400}String\(session\(\)\?\.id \|\| ""\) !== userId/, "site registry cache must be scoped to the authenticated user and reject stale login responses");
assert.match(app, /shitu:inventory-sites-changed/, "website UI must rerender when the database site registry changes");
assert.doesNotMatch(app, /mountDraftInventoryOperations|canInventoryDraftCount|shitu-branch-inventory-draft-v1|shitu-inventory-operation-log-v1|result\.fallback/, "branch inventory must not write to browser-local draft/fallback stores");
assert.doesNotMatch(authLayer, /DEFAULT_PRODUCTS|mountDraftInventoryOperations|canInventoryDraftCount|shitu-central-kitchen-draft-stock-v1|shitu-branch-inventory-draft-v1|shitu-inventory-operation-log-v1|shitu-central-kitchen-history-v1|result\.fallback|saveStock\(|pushHistory\(/, "Central inventory must not contain browser-local mutation, seed, or history fallbacks");
assert.match(authLayer, /function loadStock\(\)[\s\S]{0,260}localStorage\.getItem\(CENTRAL_KEY\)[\s\S]{0,260}return items;/, "Central may read the last PostgreSQL projection as a recovery cache");
assert.doesNotMatch(authLayer, /localStorage\.setItem\(CENTRAL_KEY/, "Central UI must not write its own authoritative stock cache");
assert.match(authLayer, /if \(\["in","pick","transfer","ship"\]\.includes\(mode\) && cloudReady\)[\s\S]{0,260}mountInventoryOperations/, "Central operation controller must mount only while PostgreSQL is ready");
assert.match(authLayer, /function branchSwitcher[\s\S]{0,700}inventorySites\(\)\.filter/, "warehouse switcher must render from the PostgreSQL-backed site registry");
assert.doesNotMatch(authLayer, /data-warehouse="fuxing"[\s\S]{0,240}data-warehouse="yongji"/, "warehouse switcher must not reintroduce a fixed Fuxing/Yongji/Central button list");
assert.doesNotMatch(inventoryCloud, /export function canInventoryDraftCount/, "inventory cloud must not expose a browser-local draft edit capability");
const inventoryOperations = read("src/inventory-operations.js");
assert.doesNotMatch(inventoryOperations, /mountDraftInventoryOperations|renderDraft\(|bindDraft\(|draft-operations-shell/, "inventory operations must expose only the PostgreSQL-backed controller");
assert.match(app, /const branchSnapshot = branchSite \? inventoryBranchSnapshot\(site\) : null;[\s\S]{0,500}const effectiveRecord = isolatedCloudRecord;/, "offline branch rendering may use only the last PostgreSQL snapshot as a read-only cache");
assert.match(app, /if \(opsHost && inventoryCloudState\(\)===\"ready\"\)[\s\S]{0,320}mountInventoryOperations/, "branch operation UI must mount only the PostgreSQL-backed operation controller");
assert.match(app, /async function runCloudTransferPlan\(steps, note\)[\s\S]{0,500}if \(!result\.ok\)[\s\S]{0,260}syncInventoryNow/, "failed branch transfers must reconcile from VPS instead of falling back to local mutation");
assert.doesNotMatch(app, /\["fuxing","yongji"\]\.includes\(site\)/, "website branch detection must remain data-driven");
assert.match(superAdminPanel, /addEventListener\("site-registry"[\s\S]{0,300}refreshSiteRegistryFromRealtime/, "Super Admin must listen for realtime site-registry invalidation");
assert.match(superAdminPanel, /inventoryDatabase\.updateSites\(state\.sites\)/, "Super Admin Database must receive live site registry changes without remounting dirty editors");
assert.match(inventoryDatabase, /function updateSites\(nextSites = \[\]\)/, "inventory Database workspace must support safe live site-registry replacement");
assert.match(inventoryCloud, /cloudRelocateStorage[\s\S]{0,900}vpsRelocateStorage/, "storage relocation must use the dedicated PostgreSQL mutation API");
assert.match(inventoryCloud, /switchActiveInventorySite[\s\S]{0,1800}runInventorySync\(targetSite, \{ reloadBranch:false, force:true \}\)/, "site switching must bypass inventory cache and hydrate from VPS");
assert.match(inventoryCloud, /async function fetchSite\(site, \{ force = false, registryReady = false \} = \{\}\)[\s\S]{0,430}vpsInventory\(site, \{ force \}\)[\s\S]{0,220}vpsMasterData\(site, \{ force \}\)/, "forced site hydration must bypass both inventory and master-data caches");
assert.match(app, /key === "zone"[\s\S]{0,1200}cloudRelocateStorage/, "changing a storage zone must relocate database stock instead of only changing local catalog state");
assert.doesNotMatch(app, /key === "zone"[\s\S]{0,500}store\.updateItem\(id, key, element\.value\)/, "zone changes must not optimistically mutate local storage before database confirmation");
const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const businessSync = read("src/business-state-sync.js");
for (const moduleName of ["settings","reservations","procurement","preparation","menu","sop","skills","attendance","schedule","remote","shared","audit"]) {
  assert(businessRoutes.includes(`${moduleName}:`), `business-state route missing ${moduleName}`);
}
assert.match(businessSync, /remote:\s*\{\s*jobCatalog:/, "remote job catalog must persist under remote permission");
assert(!/revision\s*\|\|\s*0\)\s*>\s*0[\s\S]{0,500}else if\s*\(hasBusinessEdit\(\)\)\s*\{\s*await save\(\)/.test(businessSync), "an empty server must not be seeded by an untouched clean browser");
assert.match(
  businessSync,
  /const clearBusinessStateForAuthorizationTransition = \(\) => \{[\s\S]{0,180}if \(!authorizationTransitionPending\) return false;[\s\S]{0,180}store\.resetBusinessModules\(\)/,
  "stale local business modules may only be cleared behind the authorization-transition guard"
);
assert.equal(
  (businessSync.match(/store\.resetBusinessModules\(\)/g) || []).length,
  1,
  "business-module reset must remain isolated to the authorization-transition path"
);
assert.match(businessSync, /loadedRevisionKey === key && loadedRevision === revision/, "unchanged VPS business-state revision must skip a redundant merge/render");
assert.match(businessSync, /detail:\{ status:"ready", site, unchanged:true \}/, "unchanged business-state refresh must expose the no-op status");

const uiRefresh = read("src/ui-refresh.js");
assert.match(uiRefresh, /observer\?\.disconnect\(\)/, "UI patch observer must disconnect while applying its own DOM changes");
assert.match(uiRefresh, /observer\?\.takeRecords\(\)/, "UI patch observer must discard self-generated mutation records before resuming");
assert.match(uiRefresh, /requestAnimationFrame/, "UI patching must stay animation-frame batched");

console.log("STATIC_REGRESSION_OK");
