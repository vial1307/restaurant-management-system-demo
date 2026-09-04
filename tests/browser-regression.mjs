import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ACCOUNT_MODULES } from "../src/account-permissions.js";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

async function login(page, username) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:10000 });
  assert.equal(await page.locator(".app-shell").count(),0,"unauthenticated sessions must not render the full application behind login");
  await page.locator('#auth-login-form input[name="username"]').fill(username);
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    try {
      const session = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null");
      return Boolean(session?.id);
    } catch {
      return false;
    }
  }, null, { timeout:30000 });
  await page.waitForSelector(".app-shell",{timeout:30000});
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:30000 });
}

async function assertNoPageErrors(page, errors, label) {
  await page.waitForTimeout(80);
  assert.deepEqual(errors,[],`${label} page errors: ${errors.join(" | ")}`);
}

async function selectToday(page) {
  const calendarToggle = page.locator('[data-action="toggle-calendar"]').first();
  if (!await calendarToggle.count()) return;
  await calendarToggle.click();
  const today = page.locator('[data-action="calendar-shortcut"][data-shortcut="today"]').first();
  if (await today.count()) await today.click();
}

async function setSite(page, site) {
  const currentRoute = await page.evaluate(() => location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard");
  if (currentRoute !== "inventory") {
    const inventoryNav = page.locator('.desktop-nav .nav-item[href="#inventory"]:visible, .mobile-nav .nav-item[href="#inventory"]:visible').first();
    await inventoryNav.waitFor({ state:"visible", timeout:10000 });
    await inventoryNav.click();
  }
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "inventory");
  await page.locator(".inventory-sql-status,.inventory-cloud-notice,.central-heading").first().waitFor({ state:"visible", timeout:10000 });

  const activeSite = await page.evaluate(() => {
    try {
      const user = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null");
      if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
      return localStorage.getItem("shitu-admin-active-site-v1") || "fuxing";
    } catch {
      return "fuxing";
    }
  });
  if (activeSite !== site) {
    const siteButton = page.locator(`[data-warehouse="${site}"]`).first();
    await siteButton.waitFor({ state:"visible", timeout:10000 });
    await siteButton.click();
    await page.waitForFunction((expected) => localStorage.getItem("shitu-admin-active-site-v1") === expected, site);
  }

  await selectToday(page);

  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, {timeout:10000});
  try {
    await page.waitForFunction(() => document.querySelectorAll(".inventory-row,.central-row,.central-manage-row").length > 0,{timeout:10000});
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null");
      const selected = state?.selectedDate;
      const record = state?.records?.[selected];
      return {
        href:location.href,
        selectedDate:selected,
        browserToday:new Date().toISOString().slice(0,10),
        activeSite:localStorage.getItem("shitu-admin-active-site-v1"),
        cloud:localStorage.getItem("shitu-inventory-cloud-v2"),
        inventory:Number(record?.inventory?.length || 0),
        workInventory:Number(record?.workInventory?.length || 0),
        pageText:document.querySelector(".page-content")?.innerText?.slice(0,300) || "",
      };
    });
    throw new Error(`inventory rows did not render: ${JSON.stringify(diagnostics)}`, { cause:error });
  }
}

async function assertRoutePermissions(page, username) {
  const session = await page.evaluate(()=>JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1")||"null"));
  assert(session?.permissions,`${username} session permissions missing`);
  for (const route of ACCOUNT_MODULES) {
    await page.goto(BASE + "/#" + route,{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".page-content");
    if (session.permissions[route]?.view) {
      await page.waitForFunction((expected)=>location.hash.replace(/^#/,"").split("?")[0]===expected,route);
      assert.equal(await page.locator(".access-empty-state").count(),0,`${username} blocked from allowed route ${route}`);
    } else {
      await page.waitForFunction((blocked)=>location.hash.replace(/^#/,"").split("?")[0]!==blocked,route);
      const redirected = await page.evaluate(()=>location.hash.replace(/^#/,"").split("?")[0]);
      assert.equal(session.permissions[redirected]?.view,true,`${username} redirected from ${route} to forbidden ${redirected}`);
    }
  }
}

async function inventorySearchRoundTrip(page) {
  const input = page.locator('[data-field="inventorySearch"]');
  await input.waitFor({state:"visible"});
  const before = await page.locator(".inventory-row:visible").count();
  assert(before > 0,"inventory should have visible rows");
  await input.fill("niu rou");
  assert.equal(await input.inputValue(),"niu rou");
  await page.waitForTimeout(50);
  const filtered = await page.locator(".inventory-row:visible").count();
  assert(filtered > 0 && filtered <= before,"inventory search did not filter");
  await input.fill("");
  await page.waitForTimeout(50);
  assert.equal(await input.inputValue(),"");
  const restored = await page.locator(".inventory-row:visible").count();
  assert.equal(restored,before,"clearing inventory search did not restore all rows");
}

async function adminDesktop(browser) {
  const context = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await context.newPage();
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await login(page,"yangchuadmin");

  const session = await page.evaluate(()=>JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1")||"null"));
  assert.equal(session.accountRole,"admin");
  assert.equal(session.location,"all");
  for(const key of ACCOUNT_MODULES){
    assert.equal(session.permissions[key]?.view,true,`admin missing view ${key}`);
    assert.equal(session.permissions[key]?.edit,true,`admin missing edit ${key}`);
  }

  for(const route of ACCOUNT_MODULES){
    await page.goto(BASE + "/#" + route,{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".page-content");
    assert.equal(await page.locator(".access-empty-state").count(),0,`admin blocked from ${route}`);
  }

  await page.goto(BASE + "/#dashboard",{waitUntil:"domcontentloaded"});
  const initialDate=await page.locator('[data-action="toggle-calendar"] strong').innerText();
  await page.locator('[data-action="shift-date"][data-offset="1"]').click();
  assert.notEqual(await page.locator('[data-action="toggle-calendar"] strong').innerText(),initialDate,"next-day control did not change the service date");
  await page.locator('[data-action="shift-date"][data-offset="-1"]').click();
  assert.equal(await page.locator('[data-action="toggle-calendar"] strong').innerText(),initialDate,"previous-day control did not restore the service date");
  await page.locator('[data-action="set-language"][data-language="zh"]').first().click();
  await page.waitForFunction(()=>document.documentElement.lang==="zh-Hant");
  await page.locator('[data-action="set-language"][data-language="vi"]').first().click();
  await page.waitForFunction(()=>document.documentElement.lang==="vi");

  await setSite(page,"fuxing");
  await inventorySearchRoundTrip(page);

  for(const mode of ["overview","in","pick","transfer","ship","manage","history"]){
    const button=page.locator(`[data-action="select-inventory-ops"][data-mode="${mode}"]`);
    await button.waitFor({state:"visible"});
    await button.click();
    if(["in","pick","transfer","ship"].includes(mode)){
      await page.locator("[data-op-search]").waitFor({state:"visible"});
      await page.locator("[data-op-search]").fill("niu rou");
      assert.equal(await page.locator("[data-op-search]").inputValue(),"niu rou");
      await page.locator("[data-op-search]").fill("");
    }
  }

  await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').click();
  assert((await page.locator('[data-manage-adjust="true"]').count()) > 0,"branch management quantity controls missing");
  const add=page.locator('[data-action="open-add-item"]').first();
  await add.waitFor({state:"visible"});
  await add.click();
  await page.locator('form[data-form="add-item"]').waitFor({state:"visible"});
  const saveProduct=page.locator('.modal-header-save[data-save-item]');
  await saveProduct.waitFor({state:"visible"});
  assert.match(await saveProduct.innerText(),/Lưu sản phẩm/);
  const saveBox=await saveProduct.boundingBox();
  const viewport=page.viewportSize();
  assert(saveBox && viewport && saveBox.y >= 0 && saveBox.y + saveBox.height <= viewport.height,"product save button is outside the visible viewport");
  await page.locator('button[data-action="close-modal"]').first().click();
  await page.locator(".modal-backdrop").waitFor({state:"detached"});

  await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
  await page.locator("[data-account-add]").waitFor({state:"visible"});
  assert.match(await page.locator(".account-storage-note").innerText(),/VPS PostgreSQL/,"VPS account storage notice is stale");
  await page.locator("[data-account-edit]").first().click();
  const accountModal=page.locator(".account-modal");
  await accountModal.waitFor({state:"visible"});
  assert.equal(await accountModal.locator('input[name="password"]').getAttribute("minlength"),"10");
  assert.equal(await accountModal.locator('input[name="perm:dashboard:view"]').count(),1,"dashboard view permission missing from account editor");
  assert.equal(await accountModal.locator('input[name="perm:dashboard:edit"]').count(),1,"dashboard edit permission missing from account editor");
  assert.equal(await accountModal.locator('.permission-row').first().getAttribute('data-permission-module'),'dashboard',"dashboard must be the first permission row");
  await accountModal.locator('select[name="role"]').selectOption("central");
  assert.equal(await accountModal.locator('select[name="location"]').inputValue(),"central","central role did not select central kitchen");
  await accountModal.locator('select[name="role"]').selectOption("manager");
  assert.equal(await accountModal.locator('select[name="location"]').inputValue(),"fuxing","branch role did not return to a branch location");
  await accountModal.locator("[data-account-close]").first().click();
  await accountModal.waitFor({state:"detached"});

  await setSite(page,"central");
  const centralSearch=page.locator('input[data-central-search]').first();
  await centralSearch.waitFor({state:"visible"});
  const centralRows=page.locator(".central-row");
  const centralBefore=await centralRows.count();
  assert(centralBefore > 1,"central inventory should have multiple rows");
  await centralSearch.evaluate((input)=>{
    input.value="niu rou";
    input.dispatchEvent(new InputEvent("input",{
      bubbles:true,
      composed:true,
      data:"niu rou",
      inputType:"insertCompositionText",
      isComposing:true,
    }));
  });
  assert.equal(await centralSearch.inputValue(),"niu rou");
  await page.waitForTimeout(50);
  const centralFiltered=await page.locator(".central-row:visible").count();
  assert(centralFiltered > 0 && centralFiltered < centralBefore,"central search did not filter during IME composition");
  for(let i=0;i<centralFiltered;i++){
    assert.match(await page.locator(".central-row:visible").nth(i).innerText(),/牛肉|Thịt bò/);
  }
  await centralSearch.fill("");
  await page.waitForTimeout(50);
  assert.equal(await page.locator(".central-row:visible").count(),centralBefore,"clearing central search did not restore all rows");
  const freezerTab=page.locator('[data-central-zone="央廚冷凍"]').first();
  await freezerTab.click();
  const zonedRows=page.locator(".central-row:visible");
  assert((await zonedRows.count()) > 0,"central zone filter returned no rows");
  for(let i=0;i<await zonedRows.count();i++) assert.match(await zonedRows.nth(i).innerText(),/央廚冷凍/);
  await page.locator('[data-central-zone="all"]').first().click();
  assert.equal(await page.locator(".central-row:visible").count(),centralBefore,"central all-zone filter did not restore rows");

  const navigationCount=await page.evaluate(()=>performance.getEntriesByType("navigation").length);
  await page.locator('[data-warehouse="fuxing"]').click();
  await page.locator('[data-field="inventorySearch"]').waitFor({state:"visible"});
  assert.equal(await page.locator(".central-heading").count(),0,"central page remained mounted after switching warehouse");
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("navigation").length),navigationCount,"switching warehouses reloaded the whole application");
  await page.locator('[data-warehouse="central"]').click();
  await page.locator(".central-heading.page-heading").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("navigation").length),navigationCount,"returning to central warehouse reloaded the whole application");

  await assertNoPageErrors(page,errors,"admin desktop");
  await context.clearCookies();
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#auth-login-form").waitFor({state:"visible"});
  assert.equal(await page.locator(".app-shell").count(),0,"expired sessions must not keep the heavy application mounted");
  assert.equal(await page.getByText("AUTH_REQUIRED",{exact:true}).count(),0,"expired VPS session leaked a database error");
  await context.close();
}

async function roleDesktop(browser, username, checks) {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await login(page,username);
  await assertRoutePermissions(page,username);
  if(checks.dashboardEdit !== undefined){
    await page.goto(BASE + "/#dashboard",{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".dashboard-grid");
    const actions=page.locator("[data-dashboard-edit-action]");
    if(checks.dashboardEdit){
      assert((await actions.count()) > 0,`${username} missing dashboard edit actions`);
    }else{
      assert.equal(await actions.count(),0,`${username} can access dashboard edit actions without permission`);
      const taskControls=page.locator('.task-overview input[data-field="task"]');
      for(let i=0;i<await taskControls.count();i++) assert.equal(await taskControls.nth(i).isDisabled(),true,`${username} can update a task from read-only dashboard`);
    }
  }
  if(checks.central){
    await page.goto(BASE + "/#inventory",{waitUntil:"domcontentloaded"});
    await page.locator(".central-heading.page-heading").waitFor({state:"visible"});
    await selectToday(page);
    await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, {timeout:10000});
    await page.locator('[data-central-mode="in"]').waitFor({state:"visible"});

    // Central inventory is live and must not be hidden when the shared service
    // date is moved to a historical day. This caught the production regression
    // where all four operational tabs disappeared from the central warehouse.
    await page.locator('[data-action="shift-date"][data-offset="-1"]').click();
    await page.locator(".central-heading.page-heading").waitFor({state:"visible"});
    for(const mode of ["in","pick","transfer","ship"]){
      await page.locator(`[data-central-mode="${mode}"]`).waitFor({state:"visible"});
    }
    assert.equal(await page.locator(".inventory-readonly-notice").filter({hasText:/Ảnh chụp tồn kho|歷史庫存快照/}).count(),0,"central inventory was incorrectly date-locked");
    await selectToday(page);
    await page.locator('[data-central-mode="in"]').waitFor({state:"visible"});

    assert.equal(await page.locator(".inventory-summary").count(),1,"central inventory summary must match branch layout");
    assert.equal(await page.locator(".branch-ops-tabs").count(),1,"central operation tabs must match branch layout");
    assert.equal(await page.locator(".inventory-view-switch").count(),1,"central overview view switch missing");
    assert((await page.locator(".inventory-table.storage-table .central-row").count()) > 0,"central storage overview cards missing");
    await page.locator('[data-central-view="work"]').click();
    assert((await page.locator(".inventory-table.work-table .central-row").count()) > 0,"central work overview cards missing");
    await page.locator('[data-central-view="storage"]').click();
    assert.equal(await page.locator(".warehouse-switch").count(),0);
    for(const mode of ["in","pick","transfer","ship"]){
      const tab=page.locator(`[data-central-mode="${mode}"]`);
      await tab.waitFor({state:"visible"});
      await tab.click();
      const search=page.locator("[data-op-search]");
      await search.waitFor({state:"visible"});
      await search.fill("niu rou");
      assert.equal(await search.inputValue(),"niu rou");
      await search.fill("");
    }
    if(checks.manage === true){
      const manage=page.locator('[data-central-mode="manage"]');
      await manage.waitFor({state:"visible"});
      await manage.click();
      await page.locator('[data-central-editor-open="new"]').waitFor({state:"visible"});
      assert((await page.locator('[data-central-manage-adjust="true"]').count()) > 0,"central management quantity controls missing");
      await page.locator('[data-central-editor-open="new"]').click();
      const centralSave=page.locator('.modal-header-save[data-central-save-item]');
      await centralSave.waitFor({state:"visible"});
      assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central product save action missing");
      await page.locator('button[data-central-editor-close]').click();
    }
  } else {
    const site = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.location || "fuxing";
      } catch {
        return "fuxing";
      }
    });
    await setSite(page, site === "yongji" ? "yongji" : "fuxing");
    if(checks.manage === false){
      assert.equal(await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').count(),0);
    }
    if(checks.manage === true){
      const manage=page.locator('[data-action="select-inventory-ops"][data-mode="manage"]');
      await manage.waitFor({state:"visible"});
      await manage.click();
      assert((await page.locator('[data-manage-adjust="true"]').count()) > 0,`${username} missing management quantity controls`);
    }
    if(checks.operations === false){
      assert.equal(await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').count(),0);
    }
    if(checks.operations === true){
      assert((await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').count()) > 0);
    }
    if(checks.stocktake === true){
      assert((await page.locator('input.minimum-input').count()) > 0,"stocktake control missing");
    }
  }
  await assertNoPageErrors(page,errors,username);
  await context.close();
}

async function responsiveAdmin(browser, viewport) {
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await login(page,"yangchuadmin");
  await setSite(page,"fuxing");
  await inventorySearchRoundTrip(page);

  if(viewport.width <= 390 && viewport.height >= 700){
    const mobileRoutes=page.locator(".mobile-nav .nav-item");
    assert.equal(await mobileRoutes.count(),ACCOUNT_MODULES.length,"mobile navigation does not contain every desktop module");
    for(const route of ACCOUNT_MODULES){
      assert.equal(await page.locator(`.mobile-nav .nav-item[href="#${route}"]`).count(),1,`mobile navigation is missing ${route}`);
    }

    for(const site of ["fuxing","yongji"]){
      await setSite(page,site);
      await page.locator('[data-action="shift-date"][data-offset="-1"]').first().click();
      await page.locator(".inventory-history-notice").waitFor({state:"visible"});
      for(const mode of ["overview","in","pick","transfer","ship","manage","history"]){
        const tab=page.locator(`[data-action="select-inventory-ops"][data-mode="${mode}"]`);
        await tab.waitFor({state:"visible"});
      }
      await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').click();
      await page.locator('[data-branch-inventory-operations][data-mode="in"]').waitFor({state:"visible"});
      assert.equal(await page.locator(".inventory-history-notice").count(),0,`${site} mobile operation did not switch back to today`);
      await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').click();
      await page.locator('[data-action="open-add-item"]').first().click();
      const branchSave=page.locator('.modal-header-save[data-save-item]');
      await branchSave.waitFor({state:"visible"});
      assert.match(await branchSave.innerText(),/Lưu sản phẩm|儲存品項/,`${site} mobile product save action missing`);
      await page.locator('button[data-action="close-modal"]').first().click();
      await page.locator(".modal-backdrop").waitFor({state:"detached"});
    }

    await setSite(page,"central");
    for(const mode of ["overview","in","pick","transfer","ship","manage","history"]){
      const tab=page.locator(`[data-central-mode="${mode}"]`);
      await tab.waitFor({state:"visible"});
    }
    await page.locator('[data-central-mode="manage"]').click();
    await page.locator('[data-central-editor-open="new"]').click();
    const centralSave=page.locator('.modal-header-save[data-central-save-item]');
    await centralSave.waitFor({state:"visible"});
    assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central mobile product save action missing");
    await page.locator('button[data-central-editor-close]').click();

    await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
    await page.locator("[data-account-edit]").first().click();
    const mobileAccountModal=page.locator(".account-modal");
    await mobileAccountModal.waitFor({state:"visible"});
    assert.equal(await mobileAccountModal.locator(".permission-row").count(),ACCOUNT_MODULES.length,"mobile permission editor does not contain every module");
    assert.equal(await mobileAccountModal.locator(".permission-row").first().getAttribute("data-permission-module"),"dashboard","mobile permission editor does not begin with dashboard");
    await mobileAccountModal.locator("[data-account-close]").first().click();
  }

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(overflow <= 3,`document horizontal overflow ${overflow}px at ${viewport.width}x${viewport.height}`);

  const visibleTargets=page.locator('button:visible,a.nav-item:visible,input:not([type="checkbox"]):not([type="radio"]):visible,select:visible');
  const count=Math.min(await visibleTargets.count(),40);
  for(let i=0;i<count;i++){
    const box=await visibleTargets.nth(i).boundingBox();
    if(!box) continue;
    assert(box.height >= 28,`tap target too short: ${box.height}px at ${viewport.width}x${viewport.height}`);
  }

  if(viewport.width===390 && viewport.height===844){
    await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
    await page.locator("[data-account-edit]").first().waitFor({state:"visible"});
    await page.locator("[data-account-edit]").first().click();
    await page.locator(".account-modal").waitFor({state:"visible"});
    await page.setViewportSize({width:390,height:520});
    await page.waitForTimeout(80);
    const modalBounds=await page.locator(".account-modal").evaluate((modal)=>{
      const box=modal.getBoundingClientRect();
      return {top:box.top,bottom:box.bottom};
    });
    assert(modalBounds.top >= -1,`account modal starts above visual viewport: ${modalBounds.top}px`);
    assert(modalBounds.bottom <= 521,`account modal falls below visual viewport: ${modalBounds.bottom}px`);
    await page.locator("[data-account-close]").first().click();
  }

  await assertNoPageErrors(page,errors,`responsive ${viewport.width}x${viewport.height}`);
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  await adminDesktop(browser);
  await roleDesktop(browser,"managerfx",{manage:true,operations:true,dashboardEdit:true});
  await roleDesktop(browser,"supervisorfx",{manage:true,operations:true,stocktake:true,dashboardEdit:false});
  await roleDesktop(browser,"employeefx",{manage:true,operations:true,dashboardEdit:false});
  await roleDesktop(browser,"parttimefx",{manage:false,operations:false,dashboardEdit:false});
  await roleDesktop(browser,"centralreg",{central:true,manage:true});
  await responsiveAdmin(browser,{width:359,height:740});
  await responsiveAdmin(browser,{width:390,height:844});
  await responsiveAdmin(browser,{width:844,height:390});
  console.log("BROWSER_REGRESSION_OK");
} finally {
  await browser.close();
}
