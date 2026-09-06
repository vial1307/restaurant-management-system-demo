from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "tests/catalog-stocktake-boundary-regression.mjs",
    '  /data-manage-adjust === "true" && canManageBranchCatalog\\(activeInventorySite\\(\\)\\) && canDirectInventoryAdjust\\(\\)/,',
    '  /element\\.dataset\\.manageAdjust === "true" && canManageBranchCatalog\\(activeInventorySite\\(\\)\\) && canDirectInventoryAdjust\\(\\)/,',
)

replace_once(
    "tests/browser-regression.mjs",
    '''      await manage.click();
      assert((await page.locator('[data-manage-adjust="true"]').count()) > 0,`${username} missing management quantity controls`);''',
    '''      await manage.click();
      const manageQuantityControls=await page.locator('[data-manage-adjust="true"]').count();
      if(checks.stocktake === true){
        assert(manageQuantityControls > 0,`${username} missing management quantity controls`);
      }
      if(checks.stocktake === false){
        assert.equal(manageQuantityControls,0,`${username} must not receive stocktake quantity controls`);
      }''',
)

replace_once(
    "tests/browser-regression.mjs",
    '  await roleDesktop(browser,"managerfx",{manage:true,operations:true,dashboardEdit:true});',
    '  await roleDesktop(browser,"managerfx",{manage:true,operations:true,stocktake:true,dashboardEdit:true});',
)

replace_once(
    "tests/browser-regression.mjs",
    '  await roleDesktop(browser,"employeefx",{manage:true,operations:true,dashboardEdit:false});',
    '  await roleDesktop(browser,"employeefx",{manage:true,operations:true,stocktake:false,dashboardEdit:false});',
)
