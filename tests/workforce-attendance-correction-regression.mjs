import assert from "node:assert/strict";
import { chromium } from "playwright";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const EMPLOYEE_ID = "staff-employee";
const PARTTIME_ID = "staff-parttime";
const PREFIX = "attendance-correction-regression";

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

async function login(username) {
  const result = await request("/api/auth/login", { method:"POST", body:{ username, password:PASSWORD } });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  return { cookie:result.cookie, user:result.data.user };
}

async function readState(cookie) {
  const result = await request(`/api/business-state/${SITE}`, { cookie });
  assert.equal(result.response.status, 200, `state read failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function saveAttendance(cookie, mutate) {
  const state = await readState(cookie);
  const module = structuredClone(state.modules.attendance || { attendance:[], payroll:{} });
  module.attendance ??= [];
  module.payroll ??= {};
  mutate(module);
  const expected = state.moduleRevisions.attendance;
  assert(Number.isInteger(expected), "attendance revision missing");
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:{ attendance:module }, expectedModuleRevisions:{ attendance:expected } },
  });
}

function row(id, date, staffId, staffName, clockIn="09:00", clockOut="18:00") {
  return {
    id,
    date,
    staffId,
    staffName,
    area:staffId === PARTTIME_ID ? "seafood" : "soup",
    hourlyRate:230,
    scheduledStart:"09:00",
    breakMinutes:60,
    clockIn:`${date}T${clockIn}:00.000Z`,
    clockOut:clockOut ? `${date}T${clockOut}:00.000Z` : null,
    note:`${PREFIX} seed`,
  };
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const parttime = await login("parttimefx");

const MAIN_DATE = "2034-05-02";
const STALE_DATE = "2034-05-03";
const REJECT_DATE = "2034-05-04";
const PARTTIME_DATE = "2034-05-05";
const LOCK_DATE = "2034-06-02";
const TODAY = new Date().toISOString().slice(0, 10);
const MAIN_ID = `${PREFIX}-main`;
const STALE_ID = `${PREFIX}-stale`;
const REJECT_ID = `${PREFIX}-reject`;
const PARTTIME_ROW_ID = `${PREFIX}-parttime`;
const LOCK_ID = `${PREFIX}-locked`;
const BROWSER_ID = `${PREFIX}-browser`;

const seed = await saveAttendance(admin.cookie, (module) => {
  module.attendance = (module.attendance || []).filter((entry) => !String(entry?.id || "").startsWith(PREFIX));
  module.attendance.push(
    row(MAIN_ID, MAIN_DATE, EMPLOYEE_ID, "employeefx"),
    row(STALE_ID, STALE_DATE, EMPLOYEE_ID, "employeefx"),
    row(REJECT_ID, REJECT_DATE, EMPLOYEE_ID, "employeefx"),
    row(PARTTIME_ROW_ID, PARTTIME_DATE, PARTTIME_ID, "parttimefx", "17:00", "23:00"),
    row(LOCK_ID, LOCK_DATE, EMPLOYEE_ID, "employeefx"),
    row(BROWSER_ID, TODAY, EMPLOYEE_ID, "employeefx", "10:00", "18:00"),
  );
  // Server-owned workflow data must ignore generic-client forgery.
  module.correctionRequests = [{ id:"forged-correction", status:"approved" }];
});
assert.equal(seed.response.status, 200, `attendance seed failed: ${JSON.stringify(seed.data)}`);
let managerState = await readState(manager.cookie);
assert.deepEqual(managerState.modules.attendance.correctionRequests || [], [], "generic attendance write forged correction workflow state");

const approveOriginal = await request(`/api/workforce/${SITE}/attendance/${MAIN_ID}/approve`, { method:"POST", cookie:manager.cookie });
assert.equal(approveOriginal.response.status, 200, `original approval failed: ${JSON.stringify(approveOriginal.data)}`);

const nullClockIn = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:MAIN_ID, requestedClockIn:null, requestedClockOut:null, reason:"Invalid null clock-in" },
});
assert.equal(nullClockIn.response.status, 400, "clock-in must remain mandatory in correction request");
assert.equal(nullClockIn.data.error, "WORKFORCE_CORRECTION_TIME_INVALID");

const noChange = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:MAIN_ID, requestedClockIn:`${MAIN_DATE}T09:00:00.000Z`, requestedClockOut:`${MAIN_DATE}T18:00:00.000Z`, reason:"Same values must fail" },
});
assert.equal(noChange.response.status, 400);
assert.equal(noChange.data.error, "WORKFORCE_CORRECTION_NO_CHANGE");

const mainRequest = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{
    attendanceId:MAIN_ID,
    requestedClockIn:`${MAIN_DATE}T09:15:00.000Z`,
    requestedClockOut:`${MAIN_DATE}T18:10:00.000Z`,
    reason:"Clock device recorded the wrong time",
    staffId:PARTTIME_ID,
    status:"approved",
    createdByUserId:"spoofed",
  },
});
assert.equal(mainRequest.response.status, 200, `correction create failed: ${JSON.stringify(mainRequest.data)}`);
const mainRequestId = mainRequest.data.request.id;
assert.equal(mainRequest.data.request.staffId, EMPLOYEE_ID, "server must resolve canonical staff identity");
assert.equal(mainRequest.data.request.status, "pending", "client must not forge correction status");
assert.notEqual(mainRequest.data.request.createdByUserId, "spoofed", "client must not forge correction actor");

const duplicate = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:MAIN_ID, requestedClockIn:`${MAIN_DATE}T09:20:00.000Z`, requestedClockOut:`${MAIN_DATE}T18:20:00.000Z`, reason:"Duplicate pending request" },
});
assert.equal(duplicate.response.status, 409);
assert.equal(duplicate.data.error, "WORKFORCE_CORRECTION_PENDING_EXISTS");

const parttimeRequest = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:parttime.cookie,
  body:{ attendanceId:PARTTIME_ROW_ID, requestedClockIn:`${PARTTIME_DATE}T17:05:00.000Z`, requestedClockOut:`${PARTTIME_DATE}T23:00:00.000Z`, reason:"Correct part-time clock-in" },
});
assert.equal(parttimeRequest.response.status, 200, `part-time request failed: ${JSON.stringify(parttimeRequest.data)}`);
const parttimeRequestId = parttimeRequest.data.request.id;

let employeeState = await readState(employee.cookie);
assert(employeeState.modules.attendance.attendance.every((entry) => entry.staffId === EMPLOYEE_ID), "employee received coworker attendance");
assert(employeeState.modules.attendance.correctionRequests.every((entry) => entry.staffId === EMPLOYEE_ID), "employee received coworker correction requests");
let parttimeState = await readState(parttime.cookie);
assert(parttimeState.modules.attendance.correctionRequests.every((entry) => entry.staffId === PARTTIME_ID), "part-time received coworker correction requests");

const supervisorApprove = await request(`/api/workforce/${SITE}/attendance-corrections/${mainRequestId}/approve`, { method:"POST", cookie:supervisor.cookie });
assert.equal(supervisorApprove.response.status, 403, "supervisor must not approve corrections");
assert.equal(supervisorApprove.data.error, "WORKFORCE_MANAGER_REQUIRED");
const crossCancel = await request(`/api/workforce/${SITE}/attendance-corrections/${parttimeRequestId}/cancel`, { method:"POST", cookie:employee.cookie });
assert.equal(crossCancel.response.status, 403, "employee must not cancel coworker correction");
assert.equal(crossCancel.data.error, "WORKFORCE_CORRECTION_NOT_OWN");

const genericTamper = await saveAttendance(manager.cookie, (module) => {
  module.correctionRequests = [];
  const row = module.attendance.find((entry) => entry.id === PARTTIME_ROW_ID);
  row.note = "manager note update must not delete corrections";
});
assert.equal(genericTamper.response.status, 200, `generic attendance edit failed: ${JSON.stringify(genericTamper.data)}`);
managerState = await readState(manager.cookie);
assert(managerState.modules.attendance.correctionRequests.some((entry) => entry.id === mainRequestId), "generic write deleted employee correction request");
assert(managerState.modules.attendance.correctionRequests.some((entry) => entry.id === parttimeRequestId), "generic write deleted part-time correction request");

const approveCorrection = await request(`/api/workforce/${SITE}/attendance-corrections/${mainRequestId}/approve`, { method:"POST", cookie:manager.cookie, body:{ note:"Clock evidence checked" } });
assert.equal(approveCorrection.response.status, 200, `correction approval failed: ${JSON.stringify(approveCorrection.data)}`);
managerState = await readState(manager.cookie);
let corrected = managerState.modules.attendance.attendance.find((entry) => entry.id === MAIN_ID);
assert.equal(corrected.clockIn, `${MAIN_DATE}T09:15:00.000Z`);
assert.equal(corrected.clockOut, `${MAIN_DATE}T18:10:00.000Z`);
assert.equal(corrected.approvalStatus, undefined, "correction approval must invalidate old attendance approval");
assert.equal(corrected.lastCorrectionRequestId, mainRequestId);

const staleRequest = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:STALE_ID, requestedClockIn:`${STALE_DATE}T09:10:00.000Z`, requestedClockOut:`${STALE_DATE}T18:00:00.000Z`, reason:"Create before manager edit" },
});
assert.equal(staleRequest.response.status, 200);
const staleId = staleRequest.data.request.id;
const changeSource = await saveAttendance(manager.cookie, (module) => {
  const target = module.attendance.find((entry) => entry.id === STALE_ID);
  target.note = "source changed after correction request";
});
assert.equal(changeSource.response.status, 200);
const staleApprove = await request(`/api/workforce/${SITE}/attendance-corrections/${staleId}/approve`, { method:"POST", cookie:manager.cookie });
assert.equal(staleApprove.response.status, 409, "stale attendance source must block approval");
assert.equal(staleApprove.data.error, "WORKFORCE_CORRECTION_SOURCE_CHANGED");
const staleCancel = await request(`/api/workforce/${SITE}/attendance-corrections/${staleId}/cancel`, { method:"POST", cookie:employee.cookie });
assert.equal(staleCancel.response.status, 200);

const rejectRequest = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:REJECT_ID, requestedClockIn:`${REJECT_DATE}T09:05:00.000Z`, requestedClockOut:`${REJECT_DATE}T18:00:00.000Z`, reason:"Need manager review" },
});
assert.equal(rejectRequest.response.status, 200);
const rejectId = rejectRequest.data.request.id;
const rejectEmpty = await request(`/api/workforce/${SITE}/attendance-corrections/${rejectId}/reject`, { method:"POST", cookie:manager.cookie, body:{ note:"" } });
assert.equal(rejectEmpty.response.status, 400);
assert.equal(rejectEmpty.data.error, "WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED");
const rejected = await request(`/api/workforce/${SITE}/attendance-corrections/${rejectId}/reject`, { method:"POST", cookie:manager.cookie, body:{ note:"Evidence does not match" } });
assert.equal(rejected.response.status, 200);
assert.equal(rejected.data.request.status, "rejected");

const approveLockedRow = await request(`/api/workforce/${SITE}/attendance/${LOCK_ID}/approve`, { method:"POST", cookie:manager.cookie });
assert.equal(approveLockedRow.response.status, 200);
const lockedRequest = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST", cookie:employee.cookie,
  body:{ attendanceId:LOCK_ID, requestedClockIn:`${LOCK_DATE}T09:10:00.000Z`, requestedClockOut:`${LOCK_DATE}T18:00:00.000Z`, reason:"Correction crosses payroll lock" },
});
assert.equal(lockedRequest.response.status, 200);
const lockMonth = LOCK_DATE.slice(0, 7);
const lock = await request(`/api/workforce/${SITE}/payroll-periods/${lockMonth}/lock`, { method:"POST", cookie:manager.cookie });
assert.equal(lock.response.status, 200, `payroll lock failed: ${JSON.stringify(lock.data)}`);
const lockedApprove = await request(`/api/workforce/${SITE}/attendance-corrections/${lockedRequest.data.request.id}/approve`, { method:"POST", cookie:manager.cookie });
assert.equal(lockedApprove.response.status, 409);
assert.equal(lockedApprove.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");
const reopen = await request(`/api/workforce/${SITE}/payroll-periods/${lockMonth}/reopen`, { method:"POST", cookie:manager.cookie, body:{ reason:"Attendance correction evidence received" } });
assert.equal(reopen.response.status, 200);
const approveAfterReopen = await request(`/api/workforce/${SITE}/attendance-corrections/${lockedRequest.data.request.id}/approve`, { method:"POST", cookie:manager.cookie });
assert.equal(approveAfterReopen.response.status, 200);

const cancelParttime = await request(`/api/workforce/${SITE}/attendance-corrections/${parttimeRequestId}/cancel`, { method:"POST", cookie:parttime.cookie });
assert.equal(cancelParttime.response.status, 200);

async function browserLogin(page, username) {
  await page.goto(WEB + "/", { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
  const form = page.locator("#auth-login-form");
  await form.waitFor({ state:"visible", timeout:10000 });
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="password"]').fill(PASSWORD);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(".app-shell", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:15000 });
}

const browser = await chromium.launch({ headless:true });
try {
  const employeeContext = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true });
  const employeePage = await employeeContext.newPage();
  await browserLogin(employeePage, "employeefx");
  await employeePage.goto(`${WEB}/#attendance`, { waitUntil:"domcontentloaded" });
  await employeePage.waitForSelector("[data-workforce-tabs]", { state:"visible", timeout:15000 });
  const correctionButton = employeePage.locator("[data-attendance-correction-open]").filter({ hasText:/Yêu cầu|申請/ }).first();
  await correctionButton.waitFor({ state:"visible", timeout:15000 });
  await correctionButton.click();
  const correctionForm = employeePage.locator("[data-attendance-correction-form]");
  await correctionForm.waitFor({ state:"visible", timeout:10000 });
  assert(await correctionForm.locator('input[name="clockIn"]').inputValue(), "correction form must preload current clock-in");
  const clockInInput = correctionForm.locator('input[name="clockIn"]');
  const currentClockIn = await clockInInput.inputValue();
  const changedClockIn = currentClockIn.replace(/:(\d{2})$/, (_, minutes) => `:${String((Number(minutes) + 1) % 60).padStart(2, "0")}`);
  await clockInInput.fill(changedClockIn);
  await correctionForm.locator('textarea[name="reason"]').fill("Browser regression correction request");
  await correctionForm.locator('button[type="submit"]').click();
  await employeePage.locator("[data-correction-status=\"pending\"]").first().waitFor({ state:"visible", timeout:15000 });
  await employeeContext.close();

  const managerContext = await browser.newContext({ viewport:{ width:412, height:915 }, hasTouch:true, isMobile:true });
  const managerPage = await managerContext.newPage();
  await browserLogin(managerPage, "managerfx");
  await managerPage.goto(`${WEB}/#attendance`, { waitUntil:"domcontentloaded" });
  await managerPage.waitForSelector("[data-workforce-manager-day]", { state:"visible", timeout:15000 });
  const approve = managerPage.locator("[data-attendance-correction-approve]").first();
  await approve.waitFor({ state:"visible", timeout:15000 });
  await approve.click();
  await managerPage.waitForFunction(() => !document.querySelector('[data-correction-status="pending"] [data-attendance-correction-approve]'), null, { timeout:15000 });
  const overflow = await managerPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 3, `attendance correction mobile horizontal overflow ${overflow}px`);
  await managerContext.close();
} finally {
  await browser.close();
}

console.log("WORKFORCE_ATTENDANCE_CORRECTION_REGRESSION_OK");
