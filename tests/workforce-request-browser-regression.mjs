import assert from "node:assert/strict";
import { chromium } from "playwright";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const RUN_ID = String(process.env.GITHUB_RUN_ID || Date.now());
const RUN_ATTEMPT = String(process.env.GITHUB_RUN_ATTEMPT || "1");
const RUN_TOKEN = `${RUN_ID}-${RUN_ATTEMPT}`;

function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isolatedServiceDate(token) {
  const start = Date.UTC(2027, 0, 1);
  const spanDays = 3287; // 2027-01-01 through 2035-12-31; stays inside the UI calendar's selectable window.
  const offset = stableSeed(token) % spanDays;
  return new Date(start + offset * 86400000).toISOString().slice(0, 10);
}

const DATE = isolatedServiceDate(RUN_TOKEN);
const REASON = `Browser request regression ${RUN_TOKEN}`;

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

async function seedBaseSchedule() {
  const adminCookie = await apiLogin("yangchuadmin");
  const state = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(state.response.status, 200);
  const scheduleModule = structuredClone(state.data.modules.schedule || { schedules:[] });
  scheduleModule.schedules = (scheduleModule.schedules || []).filter((entry) => entry.id !== "workforce-request-browser-base");
  scheduleModule.schedules.push({
    id:"workforce-request-browser-base",
    date:DATE,
    month:DATE.slice(0, 7),
    weekday:new Date(`${DATE}T12:00:00Z`).getUTCDay(),
    applyMode:"day",
    staffId:"staff-employee",
    staffName:"employeefx",
    department:"inside",
    area:"soup",
    shift:"custom",
    start:"10:00",
    end:"18:00",
    note:`browser request base ${RUN_TOKEN}`,
  });
  const saved = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie:adminCookie,
    body:{
      modules:{ schedule:scheduleModule },
      expectedModuleRevisions:{ schedule:state.data.moduleRevisions.schedule },
    },
  });
  assert.equal(saved.response.status, 200, `browser request schedule seed failed: ${JSON.stringify(saved.data)}`);
  return adminCookie;
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

async function selectServiceDate(page, date) {
  const [year, month] = date.split("-").map(Number);
  const toggle = page.locator('[data-action="toggle-calendar"]').first();
  await toggle.waitFor({ state:"visible", timeout:10000 });
  await toggle.click();
  await page.locator('[data-field="calendarYear"]').selectOption(String(year));
  await page.locator('[data-field="calendarMonth"]').selectOption(String(month - 1));
  const day = page.locator(`[data-action="calendar-select-day"][data-date="${date}"]`).first();
  await day.waitFor({ state:"visible", timeout:10000 });
  await day.click();
  await page.waitForFunction((expected) => {
    try { return JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null")?.selectedDate === expected; }
    catch { return false; }
  }, date, { timeout:10000 });
}

async function openSchedule(page) {
  await page.goto(`${WEB}/#schedule`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "schedule", null, { timeout:10000 });
  await page.locator("[data-workforce-tabs]").waitFor({ state:"visible", timeout:30000 });
  await page.locator("[data-workforce-request-workspace]").waitFor({ state:"visible", timeout:30000 });
  await page.waitForFunction(() => !document.querySelector(".workforce-request-loading"), null, { timeout:30000 });
}

async function waitForRequestRow(page, date, reason) {
  const row = page.locator(".workforce-request-row").filter({ hasText:date }).filter({ hasText:reason }).first();
  await row.waitFor({ state:"visible", timeout:30000 });
  return row;
}

const adminCookie = await seedBaseSchedule();
const browser = await chromium.launch({ headless:true });
try {
  const employeeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const employeePage = await employeeContext.newPage();
  const employeeErrors = [];
  employeePage.on("pageerror", (error) => employeeErrors.push(error.message));
  await browserLogin(employeePage, "employeefx");
  await selectServiceDate(employeePage, DATE);
  await openSchedule(employeePage);

  assert.equal(await employeePage.locator("[data-workforce-request-form]").count(), 1, "employee must receive own request form");
  assert.equal(await employeePage.locator(".workforce-request-queue").count(), 0, "employee must not receive manager approval queue");
  const form = employeePage.locator("[data-workforce-request-form]");
  await form.locator('[name="type"]').selectOption("change");
  assert.equal(await form.locator("[data-workforce-change-field]").first().isHidden(), false, "change request time fields must become visible");
  await form.locator('[name="date"]').fill(DATE);
  await form.locator('[name="requestedStart"]').fill("12:30");
  await form.locator('[name="requestedEnd"]').fill("20:30");
  await form.locator('[name="reason"]').fill(REASON);
  await form.locator('button[type="submit"]').click();

  let employeeRow = await waitForRequestRow(employeePage, DATE, REASON);
  assert.match(await employeeRow.innerText(), /Chờ duyệt|待審核/, "employee request pending status missing");
  assert.equal(await employeeRow.locator("[data-workforce-request-cancel]").count(), 1, "employee pending request must be cancellable by owner");
  assert.deepEqual(employeeErrors, [], `employee request page errors: ${employeeErrors.join(" | ")}`);

  const stateAfterSubmit = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  assert.equal(stateAfterSubmit.response.status, 200);
  const created = stateAfterSubmit.data.modules.schedule.requests.find((entry) => entry.date === DATE && entry.reason === REASON);
  assert(created, "browser-submitted request missing from VPS state");
  assert.equal(created.staffId, "staff-employee");
  assert.equal(created.status, "pending");
  assert.equal(created.requestedStart, "12:30");
  assert.equal(created.requestedEnd, "20:30");
  assert.equal(await employeeRow.locator(`[data-workforce-request-cancel="${created.id}"]`).count(), 1, "owner cancel control must belong to the current request");

  const managerContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const managerPage = await managerContext.newPage();
  const managerErrors = [];
  managerPage.on("pageerror", (error) => managerErrors.push(error.message));
  await browserLogin(managerPage, "managerfx");
  await selectServiceDate(managerPage, DATE);
  await openSchedule(managerPage);

  assert.equal(await managerPage.locator("[data-workforce-request-form]").count(), 0, "manager must not receive self-service request form");
  const managerRow = await waitForRequestRow(managerPage, DATE, REASON);
  assert.equal(await managerRow.locator(`[data-workforce-request-approve="${created.id}"]`).count(), 1, "manager approve control missing for current request");
  assert.equal(await managerRow.locator(`[data-workforce-request-reject-form][data-request-id="${created.id}"]`).count(), 1, "manager reject control missing for current request");
  await managerRow.locator(`[data-workforce-request-approve="${created.id}"]`).click();

  const approvedHistoryRow = await waitForRequestRow(managerPage, DATE, REASON);
  await managerPage.waitForFunction(({ id, reason }) => {
    const rows = [...document.querySelectorAll(".workforce-request-row")];
    const row = rows.find((entry) => entry.textContent?.includes(reason));
    return row?.dataset.requestStatus === "approved" && !document.querySelector(`[data-workforce-request-approve="${id}"]`);
  }, { id:created.id, reason:REASON }, { timeout:30000 });
  assert.match(await approvedHistoryRow.innerText(), /Đã duyệt|已核准/, "manager approved status missing");
  await managerPage.waitForFunction(() => document.querySelector(".workforce-effective-exceptions")?.textContent?.includes("12:30"), null, { timeout:30000 });
  assert.match(await managerPage.locator(".workforce-effective-exceptions").innerText(), /12:30.*20:30/s, "approved override is not shown as effective schedule");
  assert.deepEqual(managerErrors, [], `manager request page errors: ${managerErrors.join(" | ")}`);

  await employeePage.reload({ waitUntil:"domcontentloaded" });
  await openSchedule(employeePage);
  employeeRow = await waitForRequestRow(employeePage, DATE, REASON);
  assert.match(await employeeRow.innerText(), /Đã duyệt|已核准/, "employee must see approved own request status");
  assert.equal(await employeeRow.locator("[data-workforce-request-cancel]").count(), 0, "approved request must not remain cancellable");
  await employeePage.waitForFunction(() => document.querySelector(".workforce-effective-exceptions")?.textContent?.includes("12:30"), null, { timeout:30000 });
  assert.match(await employeePage.locator(".workforce-effective-exceptions").innerText(), /12:30.*20:30/s, "employee effective override missing after approval");
  await employeeContext.close();

  const supervisorContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const supervisorPage = await supervisorContext.newPage();
  const supervisorErrors = [];
  supervisorPage.on("pageerror", (error) => supervisorErrors.push(error.message));
  await browserLogin(supervisorPage, "supervisorfx");
  await selectServiceDate(supervisorPage, DATE);
  await openSchedule(supervisorPage);
  assert.equal(await supervisorPage.locator("[data-workforce-request-approve]").count(), 0, "supervisor must not receive approve controls");
  assert.equal(await supervisorPage.locator("[data-workforce-request-reject-form]").count(), 0, "supervisor must not receive reject controls");
  assert.equal(await supervisorPage.locator("[data-workforce-request-form]").count(), 0, "supervisor must not receive employee self-service form");
  assert.deepEqual(supervisorErrors, [], `supervisor request page errors: ${supervisorErrors.join(" | ")}`);
  await supervisorContext.close();

  const parttimeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const parttimePage = await parttimeContext.newPage();
  const parttimeErrors = [];
  parttimePage.on("pageerror", (error) => parttimeErrors.push(error.message));
  await browserLogin(parttimePage, "parttimefx");
  await selectServiceDate(parttimePage, DATE);
  await openSchedule(parttimePage);
  assert.equal(await parttimePage.locator("[data-workforce-request-form]").count(), 1, "part-time must receive own leave/change request form");
  assert.equal(await parttimePage.locator("[data-workforce-request-approve]").count(), 0, "part-time must not receive manager decision controls");
  assert.deepEqual(parttimeErrors, [], `part-time request page errors: ${parttimeErrors.join(" | ")}`);
  await parttimeContext.close();

  const finalState = await request(`/api/business-state/${SITE}`, { cookie:adminCookie });
  const finalRequest = finalState.data.modules.schedule.requests.find((entry) => entry.id === created.id);
  const finalException = finalState.data.modules.schedule.exceptions.find((entry) => entry.requestId === created.id);
  assert.equal(finalRequest?.status, "approved", "browser manager approval was not persisted");
  assert.equal(finalException?.kind, "override", "browser approval did not create override exception");
  assert.equal(finalException?.start, "12:30");
  assert.equal(finalException?.end, "20:30");
} finally {
  await browser.close();
}

console.log("WORKFORCE_REQUEST_BROWSER_REGRESSION_OK");