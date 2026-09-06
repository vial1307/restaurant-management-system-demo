from pathlib import Path

path = Path("tests/browser-regression.mjs")
text = path.read_text(encoding="utf-8")

old = '  if(viewport.width <= 390 && viewport.height >= 700){'
new = '  if(viewport.width <= 440 && viewport.height >= 700){'
if old not in text:
    raise SystemExit("mobile width guard anchor not found")
text = text.replace(old, new, 1)

old = '''    assert.equal(await mobileAccountModal.locator(".permission-row").count(),ACCOUNT_MODULES.length,"mobile permission editor does not contain every module");
    assert.equal(await mobileAccountModal.locator(".permission-row").first().getAttribute("data-permission-module"),"dashboard","mobile permission editor does not begin with dashboard");
    await mobileAccountModal.locator("[data-account-close]").first().click();'''
new = '''    assert.equal(await mobileAccountModal.locator(".permission-row").count(),ACCOUNT_MODULES.length,"mobile permission editor does not contain every module");
    assert.equal(await mobileAccountModal.locator(".permission-row").first().getAttribute("data-permission-module"),"dashboard","mobile permission editor does not begin with dashboard");
    await mobileAccountModal.evaluate((modal)=>{ modal.scrollTop=Math.min(260,modal.scrollHeight); });
    await page.waitForTimeout(60);
    const mobileDashboardRow=mobileAccountModal.locator('.permission-row[data-permission-module="dashboard"]');
    const mobilePermissionHead=mobileAccountModal.locator('.permission-head');
    const [dashboardBox,permissionHeadBox,modalBox]=await Promise.all([
      mobileDashboardRow.boundingBox(),
      mobilePermissionHead.boundingBox(),
      mobileAccountModal.boundingBox(),
    ]);
    assert(dashboardBox && permissionHeadBox && modalBox,"mobile dashboard permission geometry unavailable");
    assert(dashboardBox.y >= permissionHeadBox.y + permissionHeadBox.height - 1,"mobile dashboard permission row is hidden under sticky permission header");
    assert(dashboardBox.y + dashboardBox.height <= modalBox.y + modalBox.height,"mobile dashboard permission row falls outside the account modal viewport");
    assert.equal(await mobileDashboardRow.locator('input[name="perm:dashboard:edit"]').count(),1,"mobile dashboard edit toggle is not reachable");
    await mobileAccountModal.locator("[data-account-close]").first().click();'''
if old not in text:
    raise SystemExit("mobile account permission anchor not found")
text = text.replace(old, new, 1)

old = '''  await responsiveAdmin(browser,{width:359,height:740});
  await responsiveAdmin(browser,{width:390,height:844});
  await responsiveAdmin(browser,{width:844,height:390});'''
new = '''  await responsiveAdmin(browser,{width:359,height:740});
  await responsiveAdmin(browser,{width:390,height:844});
  await responsiveAdmin(browser,{width:440,height:956});
  await responsiveAdmin(browser,{width:844,height:390});'''
if old not in text:
    raise SystemExit("responsive invocation anchor not found")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
