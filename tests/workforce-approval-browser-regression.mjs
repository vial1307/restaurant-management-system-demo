import assert from "node:assert/strict";
import { chromium } from "playwright";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const MONTH = "2026-11";
const ENTRY_ID = "workforce-approval-browser-regression";

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(API + path, {
    method,
    headers:{
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie:response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function apiLogin(username) {
  const result = await request("/api/auth/login", { method:"POST", body:{ username, password:PASSWORD } });
  assert.equal(result.response.status, 200, `API login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `API login did not return a cookie for ${username}`);
  return result.cookie;
}

async function seedApprovedMonth() {
  const adminCookie = await apiLogin("yangchuadmin");
  const managerCookie = await apiLogin("managerfx");
  const stateRead = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(stateRead.response.status, 200);
  const module = structuredClone(stateRead.data.modules.attendance || { attendance:[], payroll:{} });
  module.attendance ??= [];
  module.payroll ??= {};
  module.attendance = module.attendance.filter((entry) => !String(entry?.date || "").startsWith(`${MONTH}-`));
  module.attendance.unshift({
    id:ENTRY_ID,
    date:`${MONTH}-09`,
    staffId:"staff-a",
    staffName:"A",
    area:"noodles",
    hourlyRate:230,
    scheduledStart:"10:00",
    clockIn:`${MONTH}-09T02:00:00.000Z`,
    clockOut:`${MONTH}-09T10:00:00.000Z`,
    breakMinutes:60,
    note:"browser approval regression",
  });
  const seed = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie:adminCookie,
    body:{
      modules:{ attendance:module },
      expectedModuleRevisions:{ attendance:stateRead.data.moduleRevisions.attendance },
    },
  });
  assert.equal(seed.response.status, 200, `browser attendance seed failed: ${JSON.stringify(seed.data)}`);
  const approve = await request(`/api/workforce/${SITE}/attendance/${ENTRY_ID}/approve`, {
    method:"POST",
    cookie:managerCookie,
  });
  assert.equal(approve.response.status, 200, `browser attendance approval failed: ${JSON.stringify(approve.data)}`);
  return { adminCookie, managerCookie };
}

async function browserLogin(page, username) {
  await page.goto(WEB + "/", { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:10000 });
  await page.locator('#auth-login-form input[name="username"]').fill(username);
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id); }
    catch { return false; }
  }, null, { timeout:30000 });
  await page.waitForSelector(".app-shell", { timeout:30000 });
}

async function selectPayrollMonth(page, month) {
  await page.goto(`${WEB}/#attendance?workforce=payroll`, { waitUntil:"domcontentloaded" });
  const input = page.locator("[data-workforce-payroll-month]");
  await input.waitFor({ state:"visible", timeout:30000 });
  await input.fill(month);
  await input.evaluate((element) => element.dispatchEvent(new Event("change", { bubbles:true })));
  await page.locator(`[data-workforce-approved-payroll][data-month="${month}"]`).waitFor({ state:"visible", timeout:10000 });
}

const { managerCookie } = await seedApprovedMonth();
const browser = await chromium.launch({ headless:true });
try {
  const managerContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const managerPage = await managerContext.newPage();
  const managerErrors = [];
  managerPage.on("pageerror", (error) => managerErrors.push(error.message));
  await browserLogin(managerPage, "managerfx");
  await selectPayrollMonth(managerPage, MONTH);

  const approvedPanel = managerPage.locator(`[data-workforce-approved-payroll][data-month="${MONTH}"]`);
  assert.equal(await managerPage.locator(".workforce-payroll-stats").isHidden(), true, "legacy all-attendance payroll stats must be hidden");
  assert.equal(await managerPage.locator(".workforce-payroll-card").isHidden(), true, "legacy all-attendance payroll table must be hidden");
  assert.match(await approvedPanel.innerText(), /Ca đã duyệt|已核准班次/, "approved-only payroll summary missing");
  assert.equal((await approvedPanel.locator(".workforce-approval-stats .stat-card.stat-green .stat-value").innerText()).trim(), "1", "approved shift count is wrong");
  const lockButton = approvedPanel.locator(`[data-workforce-lock-period="${MONTH}"]`);
  await lockButton.waitFor({ state:"visible" });
  assert.equal(await lockButton.isDisabled(), false, "ready payroll month should be lockable");
  assert.deepEqual(managerErrors, [], `manager workforce approval page errors: ${managerErrors.join(" | ")}`);

  const lock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
    method:"POST",
    cookie:managerCookie,
  });
  assert.equal(lock.response.status, 200, `browser payroll lock failed: ${JSON.stringify(lock.data)}`);

  await managerPage.reload({ waitUntil:"domcontentloaded" });
  await selectPayrollMonth(managerPage, MONTH);
  const lockedPanel = managerPage.locator(`[data-workforce-approved-payroll][data-month="${MONTH}"]`);
  assert.equal(await lockedPanel.locator('[data-workforce-reopen-form]').count(), 1, "manager must get reopen control for a locked payroll period");
  assert.equal(await lockedPanel.locator('[data-workforce-lock-period]').count(), 0, "locked payroll period must not keep the lock button");
  assert.match(await lockedPanel.innerText(), /Đã khóa|已鎖定/, "locked payroll status missing");
  await managerContext.close();

  const employeeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const employeePage = await employeeContext.newPage();
  const employeeErrors = [];
  employeePage.on("pageerror", (error) => employeeErrors.push(error.message));
  await browserLogin(employeePage, "employeefx");
  await selectPayrollMonth(employeePage, MONTH);
  const employeePanel = employeePage.locator(`[data-workforce-approved-payroll][data-month="${MONTH}"]`);
  assert.equal(await employeePanel.locator('[data-workforce-lock-period]').count(), 0, "employee must not receive payroll lock control");
  assert.equal(await employeePanel.locator('[data-workforce-reopen-form]').count(), 0, "employee must not receive payroll reopen control");
  assert.deepEqual(employeeErrors, [], `employee workforce payroll page errors: ${employeeErrors.join(" | ")}`);
  await employeeContext.close();
} finally {
  await browser.close();
}

console.log("WORKFORCE_APPROVAL_BROWSER_REGRESSION_OK");
await import("./workforce-request-contract-regression.mjs");
await import("./workforce-request-browser-regression.mjs");