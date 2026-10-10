import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE=process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD="KitchenTest!123";
const browser=await chromium.launch({headless:true});
const failures=[];
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(BASE+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.documentElement.dataset.vpsAuthReady==="true");
  const form=page.locator("#auth-login-form");
  await form.locator('input[name="username"]').fill("managerfx");
  await form.locator('input[name="password"]').fill(PASSWORD);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(".app-shell",{timeout:30000});
  await page.goto(BASE+"/#procurement",{waitUntil:"domcontentloaded"});
  await page.locator("[data-pv2-shell]").waitFor({timeout:30000});
  await page.locator('[data-pv2-action="tab"][data-tab="settings"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-pv2-action="tab"][data-tab="settings"]')?.classList.contains("active"),null,{timeout:10000});
  try {
    await page.locator('[data-pv2-action="new-supplier"]').click({timeout:12000});
  } catch (error) {
    const diagnostic=await page.evaluate(()=>{
      const session=JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1")||"null");
      const tabs=[...document.querySelectorAll('[data-pv2-action="tab"]')].map(el=>({tab:el.dataset.tab,active:el.classList.contains("active")}));
      return {
        route:location.hash,
        role:session?.accountRole||session?.role,
        site:session?.location,
        procurementPermissions:session?.permissions?.procurement,
        tabs,
        settingsVisible:Boolean(document.querySelector(".pv2-settings")),
        newSupplierButtons:document.querySelectorAll('[data-pv2-action="new-supplier"]').length,
        shellText:document.querySelector(".pv2-shell")?.innerText.slice(0,450),
        authFormVisible:Boolean(document.querySelector("#auth-login-form"))
      };
    });
    throw new Error("PROCUREMENT_SUPPLIER_BUTTON_MISSING "+JSON.stringify(diagnostic)+"; "+String(error));
  }
  const supplier=page.locator('[data-pv2-form="supplier"]');
  await supplier.locator('[name="nameZhTw"]').fill("測試連休供應商");
  await supplier.locator('[name="nameVi"]').fill("Nhà cung cấp thử lịch");
  await supplier.locator('[name="rangeStart"]').fill("2026-10-10");
  await supplier.locator('[name="rangeEnd"]').fill("2026-10-12");
  await supplier.locator('[data-pv2-action="calendar-add-range"]').click();
  assert.equal(await supplier.locator(".pv2-date-chip").count(),3,"range should include all 3 dates");
  assert.equal(await supplier.locator('[name="nameZhTw"]').inputValue(),"測試連休供應商","editing form must survive calendar rerender");
  const next=page.locator('[data-pv2-action="calendar-day"][data-date="2026-10-15"]');
  await next.click();
  await page.locator('[data-pv2-action="calendar-day"][data-date="2026-10-16"]').click();
  assert.equal(await supplier.locator(".pv2-date-chip").count(),5,"click two dates must append continuous selection");
  await supplier.locator('[data-pv2-action="calendar-remove"][data-date="2026-10-11"]').click();
  assert.equal(await supplier.locator(".pv2-date-chip").count(),4,"remove single selected day");
  await supplier.locator('button[type="submit"]').click();
  await page.locator('[data-pv2-form="supplier"]').waitFor({state:"detached",timeout:15000});
  await page.locator('[data-pv2-action="edit-rule"]').first().click();
  const dialog=page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({state:"visible"});
  assert.equal(await dialog.locator('[data-pv2-form="rule"]').count(),1,"product settings are in popup");
  assert.equal(await dialog.locator(".pv2-db-reference").count(),1,"modal reuses warehouse stock and locations");
  assert.equal(await dialog.locator('[name="reorderAlertEnabled"]').count(),1,
    "location-aware reorder warning must be in existing product settings");
  assert.equal(await dialog.locator('[name="reorderLocationId"]').count(),1);
  assert.equal(await dialog.locator('[name="reorderReferenceQuantity"]').count(),1);
  const safetyMode=dialog.locator('[name="safetyStockMode"]');
  const safetyInput=dialog.locator('[name="safetyStock"]');
  assert.equal(await safetyMode.count(),1,"safety source selector must exist on mobile and desktop");
  assert.equal(await safetyMode.inputValue(),"inventory","Inventory minimum is the default safety source");
  assert.equal(await safetyInput.getAttribute("readonly"),"","linked Inventory safety is not independently editable");
  await safetyMode.selectOption("custom");
  assert.equal(await safetyInput.getAttribute("readonly"),null,"manual safety must be editable after explicit selection");
  await safetyInput.fill("5");
  await safetyMode.selectOption("inventory");
  assert.equal(await safetyInput.getAttribute("readonly"),"","return to live Inventory mode");

  assert.equal(await dialog.locator('[name="reorderNumerator"]').inputValue(),"1");
  assert.equal(await dialog.locator('[name="reorderDenominator"]').inputValue(),"3");
  const bounds=await dialog.boundingBox();
  assert(bounds && bounds.x>=0 && bounds.y>=0 && bounds.width<=viewport.width+2,
   `dialog must fit viewport ${viewport.width}px: ${JSON.stringify(bounds)}`);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="dialog"]').count(),0,"Escape must close popup");
  await page.locator('[data-pv2-action="edit-rule"]').first().click();
  await page.locator('[data-pv2-form="rule"] .pv2-editor-actions button[data-pv2-action="close-editor"]').click();
  assert.equal(await page.locator('[role="dialog"]').count(),0,"Cancel must close popup");
  const responsePromise=page.waitForResponse(r=>/\/api\/inventory\/(fuxing|central|yongji)/.test(r.url())&&r.request().method()==="GET",{timeout:10000});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await responsePromise;
  // A single component must fit narrow phones, tablets and desktop without clipping.
  // The only allowed horizontal scrolling surface is the mobile tab strip.
  await page.locator('[data-pv2-action="tab"][data-tab="list"]').click();
  for(const width of [320,359,375,390,430,600,760,768,820,900,960,991,992,1024,1440]){
    await page.setViewportSize({width,height:844});
    const measure=await page.evaluate(()=>{
      const bounds=(element)=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth}};
      const shell=document.querySelector('.pv2-shell');
      const nav=shell?.querySelector('.pv2-tabs');
      const first=shell?.querySelector('.pv2-product');
      const stats=[...(shell?.querySelectorAll('.pv2-stat')||[])].map(bounds);
      const controls=[...(shell?.querySelectorAll('.pv2-filters input,.pv2-filters select')||[])].map(bounds);
      const cards=[...(shell?.querySelectorAll('.pv2-product')||[])].slice(0,10).map(bounds);
      const columns=first?[...first.querySelectorAll('.pv2-cell:not(.pv2-select)')].map(bounds):[];
      return {viewport:window.innerWidth,docWidth:document.documentElement.scrollWidth,shell:shell?bounds(shell):null,
        nav:nav?bounds(nav):null,navWrap:nav?getComputedStyle(nav).flexWrap:null,
        tabs:[...(nav?.querySelectorAll('.pv2-tab')||[])].map(bounds),stats,controls,cards,columns};
    });
    assert(measure.shell,`missing procurement shell at ${width}px`);
    assert(measure.docWidth<=measure.viewport+4,`${width}px document overflow ${measure.docWidth-measure.viewport}px`);
    const inside=(box)=>!box||box.left>=-5&&box.right<=measure.viewport+5;
    assert(inside(measure.shell),`${width}px shell outside viewport: ${JSON.stringify(measure.shell)}`);
    assert(inside(measure.nav),`${width}px tabs outside viewport: ${JSON.stringify(measure.nav)}`);
    for(const box of [...measure.stats,...measure.controls,...measure.cards])
      assert(inside(box),`${width}px element outside viewport: ${JSON.stringify(box)}`);
    if(width<=600){
      assert.equal(measure.tabs.length,5,`${width}px must render all 5 tabs`);
      assert.equal(measure.navWrap,"nowrap",`${width}px tabs must never wrap to a second row`);
      assert(measure.tabs.every(x=>Math.abs(x.top-measure.tabs[0].top)<2),
        `${width}px tabs must share the same top coordinate`);
      const last=measure.tabs.at(-1),scrollPossible=measure.nav.scrollWidth>measure.nav.clientWidth;
      assert(scrollPossible||last.right<=measure.nav.right+3,
        `${width}px tabs inaccessible: ${JSON.stringify({nav:measure.nav,last,scrollPossible})}`);
    }
    if(width<=991){
      assert(measure.tabs.every(x=>Math.abs(x.height-measure.tabs[0].height)<2),
       `${width}px tabs must stay aligned`);
      assert(measure.stats.every(x=>Math.abs(x.height-measure.stats[0].height)<2),
       `${width}px stats must stay aligned`);
      if(measure.cards.length)
        assert(measure.columns.every(x=>x.width>=70),
         `${width}px product cells too narrow: ${JSON.stringify(measure.columns)}`);
    }
  }
  await page.setViewportSize(viewport);
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(horizontalOverflow<=4,`Procurement ${viewport.width}px horizontal overflow: ${horizontalOverflow}`);
  assert.deepEqual(errors,[],`Procurement browser errors: ${errors.join(" | ")}`);
  await context.close();
 }
 console.log("PROCUREMENT_V2_BROWSER_OK");
}finally{await browser.close();}
