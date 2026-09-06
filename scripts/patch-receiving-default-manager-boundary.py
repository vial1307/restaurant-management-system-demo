from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one anchor, found {count}: {old[:140]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_exact_count(path, old, new, expected):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} anchors, found {count}: {old[:140]!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")


# Frontend permission boundary: receiving-default ownership is narrower than
# generic catalog/inventory edit access.
replace_once(
    "src/inventory-cloud.js",
    '''export function canManageBranchCatalog(site = activeInventorySite()) {
  if (!canViewBranchCatalogManagement(site)) return false;
  if (inventoryCloudState() !== "ready") return false;
  if (globalThis.navigator?.onLine === false) return false;
  // Catalog/storage management is master data. It must not be locked just because
  // the operator is viewing a different service date.
  return true;
}

export function canDirectInventoryAdjust() {''',
    '''export function canManageBranchCatalog(site = activeInventorySite()) {
  if (!canViewBranchCatalogManagement(site)) return false;
  if (inventoryCloudState() !== "ready") return false;
  if (globalThis.navigator?.onLine === false) return false;
  // Catalog/storage management is master data. It must not be locked just because
  // the operator is viewing a different service date.
  return true;
}

export function canManageReceiveDefault(site = activeInventorySite()) {
  const s = session();
  if (!s || !hasInventoryPermission("edit")) return false;
  const currentRole = role();
  if (currentRole === "admin") return ["central","fuxing","yongji"].includes(site);
  return currentRole === "manager"
    && ["fuxing","yongji"].includes(site)
    && (s.location === site || s.location === "all");
}

export function canDirectInventoryAdjust() {''',
)
replace_once(
    "src/inventory-cloud.js",
    'if(!hasInventoryPermission("edit")) return {ok:false,fallback:false,error:new Error("INVENTORY_EDIT_NOT_ALLOWED")};\n  if(globalThis.navigator?.onLine===false)',
    'if(!canManageReceiveDefault(site)) return {ok:false,fallback:false,error:new Error("RECEIVE_DEFAULT_MANAGER_REQUIRED")};\n  if(globalThis.navigator?.onLine===false)',
)

# Branch product editor: show the configured value to catalog editors, but only
# a receiving-site manager/admin can change it or trigger the write API.
replace_once(
    "src/app.js",
    '''  canDirectInventoryAdjust,
  canManageBranchCatalog,
  canViewBranchCatalogManagement,''',
    '''  canDirectInventoryAdjust,
  canManageBranchCatalog,
  canManageReceiveDefault,
  canViewBranchCatalogManagement,''',
)
replace_once(
    "src/app.js",
    '''  const stocktakeEditable = canDirectInventoryAdjust();
  const locations = ZONES.map((zone) => {''',
    '''  const stocktakeEditable = canDirectInventoryAdjust();
  const receiveDefaultEditable = canManageReceiveDefault(activeInventorySite());
  const locations = ZONES.map((zone) => {''',
)
replace_once(
    "src/app.js",
    '''<select name="receiveZone">${receiveOptions}</select><small class="ingredient-form-guide">''',
    '''<select name="receiveZone" ${receiveDefaultEditable ? "" : 'disabled aria-disabled="true"'}>${receiveOptions}</select>${receiveDefaultEditable ? "" : `<input type="hidden" name="receiveZone" value="${escapeHtml(receiveZone)}" />`}<small class="ingredient-form-guide">''',
)
old_receive_call = '''const receiveResult = await cloudSetReceiveDefault({
          site,
          catalogKey,
          locationCode:receiveZone ? branchLocationCode(site,receiveZone) : "",
        });'''
new_receive_call = '''const receiveResult = canManageReceiveDefault(site)
          ? await cloudSetReceiveDefault({
              site,
              catalogKey,
              locationCode:receiveZone ? branchLocationCode(site,receiveZone) : "",
            })
          : {ok:true,skipped:true};'''
replace_exact_count("src/app.js", old_receive_call, new_receive_call, 2)

# Backend security boundary: receive-default writes are branch-owned manager
# configuration, not a generic catalog-edit operation.
replace_once(
    "vps/backend/src/inventory-extra-routes.mjs",
    '''function requireCatalogManager(user, site, reply) {
  // Catalogue access follows the explicit inventory edit permission. Role
  // names must not silently override a permission granted by an administrator.
  return requireInventory(user, site, "edit", reply);
}

export async function registerInventoryExtraRoutes(app) {''',
    '''function requireCatalogManager(user, site, reply) {
  // Catalogue access follows the explicit inventory edit permission. Role
  // names must not silently override a permission granted by an administrator.
  return requireInventory(user, site, "edit", reply);
}

function canManageReceiveDefault(user, site) {
  if (!siteAllowed(user, site) || !hasPermission(user, "inventory", "edit")) return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && ["fuxing","yongji"].includes(site);
}

function requireReceiveDefaultManager(user, site, reply) {
  if (!requireInventory(user, site, "edit", reply)) return false;
  if (canManageReceiveDefault(user, site)) return true;
  reply.code(403).send({ error: "RECEIVE_DEFAULT_MANAGER_REQUIRED" });
  return false;
}

export async function registerInventoryExtraRoutes(app) {''',
)
replace_once(
    "vps/backend/src/inventory-extra-routes.mjs",
    '''    if (!SITES.has(site) || !catalogKey) {
      return reply.code(400).send({ error: "INVALID_RECEIVE_DEFAULT" });
    }
    if (!requireCatalogManager(user, site, reply)) return;

    if (!locationCode) {''',
    '''    if (!SITES.has(site) || !catalogKey) {
      return reply.code(400).send({ error: "INVALID_RECEIVE_DEFAULT" });
    }
    if (!requireReceiveDefaultManager(user, site, reply)) return;

    if (!locationCode) {''',
)

# Canonical spec clarification.
replace_once(
    "docs/SYSTEM_SPECIFICATION.md",
    '''- multiple configured storage locations -> branch manager must configure `央廚出貨收貨儲位` / default receiving location
- multiple locations + no receiving default -> shipment is blocked''',
    '''- multiple configured storage locations -> branch manager must configure `央廚出貨收貨儲位` / default receiving location
- receiving-default writes are restricted to the receiving site's manager or admin; supervisor/employee/central shipping roles may consume routing metadata but cannot change a branch-owned default
- multiple locations + no receiving default -> shipment is blocked''',
)

# Browser role parity on desktop and admin mobile.
replace_once(
    "tests/browser-regression.mjs",
    '''      if(checks.stocktake === false){
        assert.equal(await workMinimum.getAttribute("readonly"),"",`${username} can edit work minimum without stocktake authority`);
      }
      await page.locator('button[data-action="close-modal"]').first().click();''',
    '''      if(checks.stocktake === false){
        assert.equal(await workMinimum.getAttribute("readonly"),"",`${username} can edit work minimum without stocktake authority`);
      }
      const receiveDefault=page.locator('select[name="receiveZone"]');
      await receiveDefault.waitFor({state:"visible"});
      if(checks.receiveDefault === true){
        assert.equal(await receiveDefault.isDisabled(),false,`${username} receiving default unexpectedly disabled`);
      }
      if(checks.receiveDefault === false){
        assert.equal(await receiveDefault.isDisabled(),true,`${username} can edit branch-owned receiving default`);
      }
      await page.locator('button[data-action="close-modal"]').first().click();''',
)
replace_once(
    "tests/browser-regression.mjs",
    '''  await roleDesktop(browser,"managerfx",{manage:true,operations:true,stocktake:true,dashboardEdit:true});
  await roleDesktop(browser,"supervisorfx",{manage:true,operations:true,stocktake:true,dashboardEdit:false});
  await roleDesktop(browser,"employeefx",{manage:true,operations:true,stocktake:false,dashboardEdit:false});''',
    '''  await roleDesktop(browser,"managerfx",{manage:true,operations:true,stocktake:true,receiveDefault:true,dashboardEdit:true});
  await roleDesktop(browser,"supervisorfx",{manage:true,operations:true,stocktake:true,receiveDefault:false,dashboardEdit:false});
  await roleDesktop(browser,"employeefx",{manage:true,operations:true,stocktake:false,receiveDefault:false,dashboardEdit:false});''',
)
replace_once(
    "tests/browser-regression.mjs",
    '''      assert.equal(await page.locator('input[name="workMinimum"]').getAttribute("readonly"),null,`${site} admin work minimum must remain editable on mobile`);
      await page.locator('button[data-action="close-modal"]').first().click();''',
    '''      assert.equal(await page.locator('input[name="workMinimum"]').getAttribute("readonly"),null,`${site} admin work minimum must remain editable on mobile`);
      assert.equal(await page.locator('select[name="receiveZone"]').isDisabled(),false,`${site} admin receiving default must remain editable on mobile`);
      await page.locator('button[data-action="close-modal"]').first().click();''',
)
replace_once(
    "tests/browser-regression.mjs",
    '''  const saveBox=await saveProduct.boundingBox();
  const viewport=page.viewportSize();''',
    '''  assert.equal(await page.locator('select[name="receiveZone"]').isDisabled(),false,"admin receiving default unexpectedly disabled");
  const saveBox=await saveProduct.boundingBox();
  const viewport=page.viewportSize();''',
)

# Legacy API regression wrapper: supervisor must now be rejected by the
# receiving-default endpoint, while managerYj's existing success assertion remains.
replace_once(
    "vps/backend/scripts/api-regression-v6.mjs",
    '''const oldEmployeeStocktakeAssertion = `assert.equal(employeeSet.response.status,200);\\nassert.equal(Number(employeeSet.data.after),99);`;
assert(source.includes(oldEmployeeStocktakeAssertion), "employee stocktake regression changed; update v6 runner explicitly");

const migrated = source''',
    '''const oldEmployeeStocktakeAssertion = `assert.equal(employeeSet.response.status,200);\\nassert.equal(Number(employeeSet.data.after),99);`;
assert(source.includes(oldEmployeeStocktakeAssertion), "employee stocktake regression changed; update v6 runner explicitly");

const oldSupervisorReceiveDefaultAssertion = `assert.equal((await request("/api/inventory/receive-default",{\\n  method:"POST",cookie:supervisor.cookie,\\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\\n})).response.status,200);`;
assert(source.includes(oldSupervisorReceiveDefaultAssertion), "supervisor receive-default regression changed; update v6 runner explicitly");

const migrated = source''',
)
replace_once(
    "vps/backend/scripts/api-regression-v6.mjs",
    '''  .replace(
    oldEmployeeStocktakeAssertion,
    `assert.equal(employeeSet.response.status,403);\\nassert.equal(employeeSet.data.error,"STOCKTAKE_ROLE_REQUIRED");`
  );''',
    '''  .replace(
    oldEmployeeStocktakeAssertion,
    `assert.equal(employeeSet.response.status,403);\\nassert.equal(employeeSet.data.error,"STOCKTAKE_ROLE_REQUIRED");`
  )
  .replace(
    oldSupervisorReceiveDefaultAssertion,
    `const supervisorReceiveDefault = await request("/api/inventory/receive-default",{\\n  method:"POST",cookie:supervisor.cookie,\\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\\n});\\nassert.equal(supervisorReceiveDefault.response.status,403);\\nassert.equal(supervisorReceiveDefault.data.error,"RECEIVE_DEFAULT_MANAGER_REQUIRED");`
  );''',
)

print("receiving-default manager boundary patch applied")
