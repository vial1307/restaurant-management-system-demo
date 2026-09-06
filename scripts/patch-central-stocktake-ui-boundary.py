from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# Central catalog management remains available to authorized central inventory
# editors, but absolute quantity/minimum stocktake controls must use the same
# admin/manager/supervisor boundary as branch inventory.
replace_once(
    "src/auth-layer.js",
    'function centralManageView(items, selectedZone, query, language, allowDelete = false, writable = true) {',
    'function centralManageView(items, selectedZone, query, language, allowDelete = false, writable = true, stocktakeWritable = false) {',
)
replace_once(
    "src/auth-layer.js",
    'centralQuantityControl({id:`manage-${row.id}`,itemKey:row.itemKey||key,locationCode:centralLocationCode(row.zone),quantity:row.qty,unit:row.unit||item.unit||"",direct:writable,manageAdjust:true})',
    'centralQuantityControl({id:`manage-${row.id}`,itemKey:row.itemKey||key,locationCode:centralLocationCode(row.zone),quantity:row.qty,unit:row.unit||item.unit||"",direct:stocktakeWritable,manageAdjust:stocktakeWritable})',
)
replace_once(
    "src/auth-layer.js",
    'function centralEditorModal(items, editorKey, language) {',
    'function centralEditorModal(items, editorKey, language, stocktakeEditable = false) {',
)
replace_once(
    "src/auth-layer.js",
    '<label><span>${language === "zh" ? "現有" : "Hiện có"}</span><input type="number" min="0" name="central-quantity:${esc(zone)}" value="${Number(stored?.qty || 0)}"/></label>',
    '<label><span>${language === "zh" ? "現有" : "Hiện có"}</span><input type="number" min="0" name="central-quantity:${esc(zone)}" value="${Number(stored?.qty || 0)}" ${stocktakeEditable ? "" : \'readonly aria-readonly="true"\'}/></label>',
)
replace_once(
    "src/auth-layer.js",
    '<label><span>${language === "zh" ? "標準量" : "Định mức"}</span><input type="number" min="0" name="central-minimum:${esc(zone)}" value="${Number(stored?.minimum || 0)}"/></label>',
    '<label><span>${language === "zh" ? "標準量" : "Định mức"}</span><input type="number" min="0" name="central-minimum:${esc(zone)}" value="${Number(stored?.minimum || 0)}" ${stocktakeEditable ? "" : \'readonly aria-readonly="true"\'}/></label>',
)
replace_once(
    "src/auth-layer.js",
    'centralManageView(items, selectedZone, query, language, canViewHistory, canManageCatalog)',
    'centralManageView(items, selectedZone, query, language, canViewHistory, canManageCatalog, canDirectInventoryAdjust())',
)
replace_once(
    "src/auth-layer.js",
    'centralEditorModal(items, editorKey, language)',
    'centralEditorModal(items, editorKey, language, canDirectInventoryAdjust())',
)
replace_once(
    "src/auth-layer.js",
    '    const manageAdjust=input?.dataset.centralManageAdjust==="true" && canManageCentralCatalog();\n    if (!input || (!canDirectInventoryAdjust() && !manageAdjust && !(canInventoryDraftCount() && user.role === "admin"))) return;',
    '    if (!input || (!canDirectInventoryAdjust() && !(canInventoryDraftCount() && user.role === "admin"))) return;',
)
replace_once(
    "src/auth-layer.js",
    'const result=await cloudSetQuantity({itemKey,locationCode,quantity:next,note:"盤點調整 / Điều chỉnh kiểm kê",allowInventoryEditor:manageAdjust});',
    'const result=await cloudSetQuantity({itemKey,locationCode,quantity:next,note:"盤點調整 / Điều chỉnh kiểm kê"});',
)

# Browser regression: central role keeps catalog entry points but does not get
# direct stocktake controls; admin remains able to stocktake Central inventory.
replace_once(
    "tests/browser-regression.mjs",
    '''      assert((await page.locator('[data-central-manage-adjust="true"]').count()) > 0,"central management quantity controls missing");
      await page.locator('[data-central-editor-open="new"]').click();
      const centralSave=page.locator('.modal-header-save[data-central-save-item]');
      await centralSave.waitFor({state:"visible"});
      assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central product save action missing");
      await page.locator('button[data-central-editor-close]').click();''',
    '''      const centralManageQuantityControls=await page.locator('[data-central-manage-adjust="true"]').count();
      if(checks.stocktake === true){
        assert(centralManageQuantityControls > 0,"central stocktake quantity controls missing");
      }
      if(checks.stocktake === false){
        assert.equal(centralManageQuantityControls,0,"central role must not receive direct stocktake quantity controls");
      }
      await page.locator('[data-central-editor-open="new"]').click();
      const centralSave=page.locator('.modal-header-save[data-central-save-item]');
      await centralSave.waitFor({state:"visible"});
      assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central product save action missing");
      const centralQuantityField=page.locator('input[name^="central-quantity:"]').first();
      const centralMinimumField=page.locator('input[name^="central-minimum:"]').first();
      if(checks.stocktake === false){
        assert.equal(await centralQuantityField.getAttribute("readonly"),"","central role quantity field must be read-only");
        assert.equal(await centralMinimumField.getAttribute("readonly"),"","central role minimum field must be read-only");
      }
      if(checks.stocktake === true){
        assert.equal(await centralQuantityField.getAttribute("readonly"),null,"central stocktake quantity field unexpectedly read-only");
        assert.equal(await centralMinimumField.getAttribute("readonly"),null,"central stocktake minimum field unexpectedly read-only");
      }
      await page.locator('button[data-central-editor-close]').click();''',
)
replace_once(
    "tests/browser-regression.mjs",
    '  await roleDesktop(browser,"centralreg",{central:true,manage:true});',
    '  await roleDesktop(browser,"centralreg",{central:true,manage:true,stocktake:false});',
)
replace_once(
    "tests/browser-regression.mjs",
    '''    const centralSave=page.locator('.modal-header-save[data-central-save-item]');
    await centralSave.waitFor({state:"visible"});
    assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central mobile product save action missing");
    await page.locator('button[data-central-editor-close]').click();''',
    '''    const centralSave=page.locator('.modal-header-save[data-central-save-item]');
    await centralSave.waitFor({state:"visible"});
    assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central mobile product save action missing");
    assert.equal(await page.locator('input[name^="central-quantity:"]').first().getAttribute("readonly"),null,"admin central quantity field must remain editable on mobile");
    assert.equal(await page.locator('input[name^="central-minimum:"]').first().getAttribute("readonly"),null,"admin central minimum field must remain editable on mobile");
    await page.locator('button[data-central-editor-close]').click();''',
)

print("central stocktake UI boundary patch applied")
