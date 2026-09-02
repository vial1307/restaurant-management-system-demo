import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ACCOUNT_MODULES } from "../src/account-permissions.js";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

async function login(page, username) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded" });
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
  }, null, { timeout:10000 });
  await page.waitForSelector(".app-shell",{timeout:10000});
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:10000 });
}

async function assertNoPageErrors(page, errors, label) {
  await page.waitForTimeout(80);
  assert.deepEqual(errors,[],`${label} page errors: ${errors.join(" | ")}`);
}

async function setSite(page, site) {
  await page.evaluate((value)=>localStorage.setItem("shitu-admin-active-site-v1",value),site);
  await page.goto(BASE + "/#inventory",{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".page-content");

  const calendarToggle = page.locator('[data-action="toggle-calendar"]').first();
  if (await calendarToggle.count()) {
    await calendarToggle.click();
    const today = page.locator('[data-action="calendar-shortcut"][data-shortcut="today"]').first();
    if (await today.count()) await today.click();
  }

  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, {timeout:10000});
  await page.waitForFunction(() => document.querySelectorAll(".inventory-row,.central-row,.central-manage-row").length > 0,{timeout:10000});
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
  const add=page.locator('[data-action="open-add-item"]').first();
  await add.waitFor({state:"visible"});
  await add.click();
  await page.locator('form[data-form="add-item"]').waitFor({state:"visible"});
  await page.locator('button[data-action="close-modal"]').first().click();
  await page.locator(".modal-backdrop").waitFor({state:"detached"});

  await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
  await page.locator("[data-account-add]").waitFor({state:"visible"});

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

  await assertNoPageErrors(page,errors,"admin desktop");
  await context.close();
}

async function roleDesktop(browser, username, checks) {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await login(page,username);
  if(checks.central){
    await page.goto(BASE + "/#inventory",{waitUntil:"domcontentloaded"});
    await page.locator('input[data-central-search]').first().waitFor({state:"visible"});
    assert.equal(await page.locator(".warehouse-switch").count(),0);
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
    await page.evaluate(async()=>{
      document.documentElement.style.setProperty("--visual-height","520px");
      document.documentElement.style.setProperty("--visual-offset-top","40px");
      await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const modalBounds=await page.locator(".account-modal").evaluate((modal)=>{
      const box=modal.getBoundingClientRect();
      return {top:box.top,bottom:box.bottom};
    });
    assert(modalBounds.top >= 39,`account modal starts above visual viewport: ${modalBounds.top}px`);
    assert(modalBounds.bottom <= 561,`account modal falls below visual viewport: ${modalBounds.bottom}px`);
    await page.locator("[data-account-close]").first().click();
  }

  await assertNoPageErrors(page,errors,`responsive ${viewport.width}x${viewport.height}`);
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  await adminDesktop(browser);
  await roleDesktop(browser,"managerfx",{manage:true,operations:true});
  await roleDesktop(browser,"supervisorfx",{manage:false,operations:true,stocktake:true});
  await roleDesktop(browser,"employeefx",{manage:false,operations:true});
  await roleDesktop(browser,"parttimefx",{manage:false,operations:false});
  await roleDesktop(browser,"centralreg",{central:true});
  await responsiveAdmin(browser,{width:359,height:740});
  await responsiveAdmin(browser,{width:390,height:844});
  await responsiveAdmin(browser,{width:844,height:390});
  console.log("BROWSER_REGRESSION_OK");
} finally {
  await browser.close();
}
