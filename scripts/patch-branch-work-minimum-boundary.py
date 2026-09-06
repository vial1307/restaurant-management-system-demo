from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/app.js",
    'name="workMinimum" value="${working?.minimum ?? 1}" />',
    'name="workMinimum" value="${working?.minimum ?? (stocktakeEditable ? 1 : 0)}" ${stocktakeEditable ? "" : \'readonly aria-readonly="true"\'} />',
)

replace_once(
    "tests/browser-regression.mjs",
    '''      if(checks.stocktake === false){
        assert.equal(manageQuantityControls,0,`${username} must not receive stocktake quantity controls`);
      }
    }''',
    '''      if(checks.stocktake === false){
        assert.equal(manageQuantityControls,0,`${username} must not receive stocktake quantity controls`);
      }
      const editItem=page.locator('[data-action="open-edit-item"]').first();
      await editItem.waitFor({state:"visible"});
      await editItem.click();
      const workMinimum=page.locator('input[name="workMinimum"]');
      await workMinimum.waitFor({state:"visible"});
      if(checks.stocktake === true){
        assert.equal(await workMinimum.getAttribute("readonly"),null,`${username} work minimum unexpectedly read-only`);
      }
      if(checks.stocktake === false){
        assert.equal(await workMinimum.getAttribute("readonly"),"",`${username} can edit work minimum without stocktake authority`);
      }
      await page.locator('button[data-action="close-modal"]').first().click();
      await page.locator(".modal-backdrop").waitFor({state:"detached"});
    }''',
)

replace_once(
    "tests/browser-regression.mjs",
    '''      const branchSave=page.locator('.modal-header-save[data-save-item]');
      await branchSave.waitFor({state:"visible"});
      assert.match(await branchSave.innerText(),/Lưu sản phẩm|儲存品項/,`${site} mobile product save action missing`);
      await page.locator('button[data-action="close-modal"]').first().click();''',
    '''      const branchSave=page.locator('.modal-header-save[data-save-item]');
      await branchSave.waitFor({state:"visible"});
      assert.match(await branchSave.innerText(),/Lưu sản phẩm|儲存品項/,`${site} mobile product save action missing`);
      assert.equal(await page.locator('input[name="workMinimum"]').getAttribute("readonly"),null,`${site} admin work minimum must remain editable on mobile`);
      await page.locator('button[data-action="close-modal"]').first().click();''',
)

print("branch work-minimum stocktake boundary patch applied")
