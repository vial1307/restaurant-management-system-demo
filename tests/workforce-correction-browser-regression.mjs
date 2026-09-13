import assert from "node:assert/strict";
import { chromium } from "playwright";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const DATE = "2036-01-05";
const ENTRY_ID = "workforce-correction-browser-employee";
const RUN_ID = String(process.env.GITHUB_RUN_ID || Date.now());
const RUN_ATTEMPT = String(process.env.GITHUB_RUN_ATTEMPT || "1");
const REASON = `Browser correction regression ${RUN_ID}-${RUN_ATTEMPT}`;

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
  assert(result.cookie, `API login cookie missing for ${username}`);
  return result.cookie;
}

async function seedApprovedAttendance() {
  const adminCookie = await apiLogin("yangchuadmin");
  const managerCookie = await apiLogin("managerfx");
  const state = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(state.response.status, 200);
  const module = structuredClone(state.data.modules.attendance || { attendance:[], payroll:{} });
  module.attendance ??= [];
  module.payroll ??= {};
  module.attendance = module.attendance.filter((entry) => entry.id !== ENTRY_ID);
  module.attendance.unshift({
    id:ENTRY_ID,
    date:DATE,
    staffId:"staff-employee",
    staffName:"employeefx",
    area:"soup",
    hourlyRate:220,
    scheduledStart:"10:00",
    clockIn:`${DATE}T02:00:00.000Z`,
    clockOut:`${DATE}T10:00:00.000Z`,
    breakMinutes:0,
    note:"browser correction source",
  });
  const saved = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie:adminCookie,
    body:{ modules:{ attendance:module }, expectedModuleRevisions:{ attendance:state.data.moduleRevisions.attendance } },
  });
  assert.equal(saved.response.status, 200, `browser correction seed failed: ${JSON.stringify(saved.data)}`);
  const approved = await request(`/api/workforce/${SITE}/attendance/${ENTRY_ID}/approve`, {
    method:"POST",
    cookie:managerCookie,
  });
  assert.equal(approved.response.status, 200, `browser source approval failed: ${JSON.stringify(approved.data)}`);
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

async function openAttendance(page) {
  await page.goto(`${WEB}/#attendance`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "attendance", null, { timeout:10000 });
  await page.locator("[data-workforce-tabs]").waitFor({ state:"visible", timeout:30000 });
  await page.locator("[data-workforce-correction-workspace]").waitFor({ state:"visible", timeout:30000 });
  await page.waitForFunction(() => !document.querySelector(".workforce-correction-loading"), null, { timeout:30000 });
}

async function correctionRow(page, reason) {
  const row = page.locator(".workforce-correction-row").filter({ hasText:reason }).first();
  await row.waitFor({ state:"visible", timeout:30000 });
  return row;
}

const { adminCookie } = await seedApprovedAttendance();
const browser = await chromium.launch({ headless:true });
try {
  const employeeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const employeePage = await employeeContext.newPage();
  const employeeErrors = [];
  employeePage.on("pageerror", (error) => employeeErrors.push(error.message));
  await browserLogin(employeePage, "employeefx");
  await openAttendance(employeePage);

  assert.equal(await employeePage.locator("[data-workforce-correction-form]").count(), 1, "employee must receive correction self-service form");
  assert.equal(await employeePage.locator(".workforce-correction-queue").count(), 0, "employee must not receive manager correction queue");
  const form = employeePage.locator("[data-workforce-correction-form]");
  await form.locator('[name="attendanceId"]').selectOption(ENTRY_ID);
  await form.locator('[name="clockIn"]').fill(`${DATE}T02:15`);
  await form.locator('[name="clockOut"]').fill(`${DATE}T10:00`);
  await form.locator('[name="breakMinutes"]').fill("15");
  await form.locator('[name="note"]').fill("browser corrected attendance");
  await form.locator('[name="reason"]').fill(REASON);
  await form.locator('button[type="submit"]').click();

  let employeeRow = await correctionRow(employeePage, REASON);
  assert.match(await employeeRow.innerText(), /Chờ duyệt|待審核/, "employee correction pending status missing");
  assert.equal(await employeeRow.locator("[data-workforce-correction-cancel]").count(), 1, "employee pending correction must be cancellable");
  assert.deepEqual(employeeErrors, [], `employee correction page errors: ${employeeErrors.join(" | ")}`);

  const stateAfterSubmit = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(stateAfterSubmit.response.status, 200);
  const created = stateAfterSubmit.data.modules.attendance.correctionRequests.find((entry) => entry.reason === REASON);
  assert(created, "browser-submitted correction missing from VPS state");
  assert.equal(created.staffId, "staff-employee");
  assert.equal(created.attendanceId, ENTRY_ID);
  assert.equal(created.status, "pending");
  assert.equal(created.requested.breakMinutes, 15);

  const managerContext = await browser.newContext({ viewport:{ width:1365, height:900 } });
  const managerPage = await managerContext.newPage();
  const managerErrors = [];
  managerPage.on("pageerror", (error) => managerErrors.push(error.message));
  await browserLogin(managerPage, "managerfx");
  await openAttendance(managerPage);
  assert.equal(await managerPage.locator("[data-workforce-correction-form]").count(), 0, "manager must not receive employee correction form");
  let managerRow = await correctionRow(managerPage, REASON);
  assert.equal(await managerRow.locator(`[data-workforce-correction-approve="${created.id}"]`).count(), 1, "manager correction approve control missing");
  assert.equal(await managerRow.locator(`[data-workforce-correction-reject-form][data-request-id="${created.id}"]`).count(), 1, "manager correction reject control missing");
  await managerRow.locator(`[data-workforce-correction-approve="${created.id}"]`).click();
  await managerPage.waitForLoadState("domcontentloaded");
  await openAttendance(managerPage);
  managerRow = await correctionRow(managerPage, REASON);
  assert.match(await managerRow.innerText(), /Đã duyệt|已核准/, "manager approved correction status missing");
  assert.equal(await managerRow.locator("[data-workforce-correction-approve]").count(), 0, "processed correction must not keep approve control");
  assert.deepEqual(managerErrors, [], `manager correction page errors: ${managerErrors.join(" | ")}`);

  const persisted = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(persisted.response.status, 200);
  const finalRequest = persisted.data.modules.attendance.correctionRequests.find((entry) => entry.id === created.id);
  const finalAttendance = persisted.data.modules.attendance.attendance.find((entry) => entry.id === ENTRY_ID);
  assert.equal(finalRequest?.status, "approved", "browser manager correction approval was not persisted");
  assert.equal(finalAttendance?.clockIn, `${DATE}T02:15:00.000Z`);
  assert.equal(finalAttendance?.clockOut, `${DATE}T10:00:00.000Z`);
  assert.equal(finalAttendance?.breakMinutes, 15);
  assert.equal(finalAttendance?.note, "browser corrected attendance");
  assert.equal(finalAttendance?.approvalStatus, undefined, "browser correction approval must invalidate source attendance approval");

  await employeePage.reload({ waitUntil:"domcontentloaded" });
  await openAttendance(employeePage);
  employeeRow = await correctionRow(employeePage, REASON);
  assert.match(await employeeRow.innerText(), /Đã duyệt|已核准/, "employee must see approved own correction status");
  assert.equal(await employeeRow.locator("[data-workforce-correction-cancel]").count(), 0, "approved correction must not remain cancellable");
  await employeeContext.close();
  await managerContext.close();

  const supervisorContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const supervisorPage = await supervisorContext.newPage();
  const supervisorErrors = [];
  supervisorPage.on("pageerror", (error) => supervisorErrors.push(error.message));
  await browserLogin(supervisorPage, "supervisorfx");
  await openAttendance(supervisorPage);
  assert.equal(await supervisorPage.locator("[data-workforce-correction-approve]").count(), 0, "supervisor must not receive correction approve controls");
  assert.equal(await supervisorPage.locator("[data-workforce-correction-reject-form]").count(), 0, "supervisor must not receive correction reject controls");
  assert.equal(await supervisorPage.locator("[data-workforce-correction-form]").count(), 0, "supervisor must not receive employee correction form");
  assert.deepEqual(supervisorErrors, [], `supervisor correction page errors: ${supervisorErrors.join(" | ")}`);
  await supervisorContext.close();

  const parttimeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const parttimePage = await parttimeContext.newPage();
  const parttimeErrors = [];
  parttimePage.on("pageerror", (error) => parttimeErrors.push(error.message));
  await browserLogin(parttimePage, "parttimefx");
  await openAttendance(parttimePage);
  assert.equal(await parttimePage.locator("[data-workforce-correction-form]").count(), 1, "part-time must receive own correction form when own attendance exists");
  assert.equal(await parttimePage.locator("[data-workforce-correction-approve]").count(), 0, "part-time must not receive manager correction controls");
  assert.deepEqual(parttimeErrors, [], `part-time correction page errors: ${parttimeErrors.join(" | ")}`);
  await parttimeContext.close();
} finally {
  await browser.close();
}

console.log("WORKFORCE_CORRECTION_BROWSER_REGRESSION_OK");
