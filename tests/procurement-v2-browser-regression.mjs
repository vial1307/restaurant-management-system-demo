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
  await page.locator('[data-pv2-action="new-supplier"]').click();
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
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(horizontalOverflow<=4,`Procurement ${viewport.width}px horizontal overflow: ${horizontalOverflow}`);
  assert.deepEqual(errors,[],`Procurement browser errors: ${errors.join(" | ")}`);
  await context.close();
 }
 console.log("PROCUREMENT_V2_BROWSER_OK");
}finally{await browser.close();}
