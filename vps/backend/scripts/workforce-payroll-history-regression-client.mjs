import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const MONTH = "2038-07";
const DATE_EMPLOYEE = `${MONTH}-05`;
const DATE_PARTTIME = `${MONTH}-06`;
const EMPLOYEE_ROW = "payroll-history-employee";
const PARTTIME_ROW = "payroll-history-parttime";

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(BASE + path, {
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
  assert(result.cookie, `login cookie missing for ${username}`);
  return result.cookie;
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
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{
      modules:{ attendance:module },
      expectedModuleRevisions:{ attendance:state.moduleRevisions.attendance },
    },
  });
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");

const seed = await saveAttendance(admin, (module) => {
  module.attendance = module.attendance.filter((entry) => ![EMPLOYEE_ROW, PARTTIME_ROW].includes(String(entry?.id || "")));
  module.attendance.unshift(
    {
      id:EMPLOYEE_ROW,
      date:DATE_EMPLOYEE,
      staffId:"staff-employee",
      staffName:"employeefx",
      area:"soup",
      hourlyRate:220,
      scheduledStart:"10:00",
      clockIn:`${DATE_EMPLOYEE}T10:15:00.000Z`,
      clockOut:`${DATE_EMPLOYEE}T18:15:00.000Z`,
      breakMinutes:30,
      note:"payroll history r1 employee",
    },
    {
      id:PARTTIME_ROW,
      date:DATE_PARTTIME,
      staffId:"staff-parttime",
      staffName:"parttimefx",
      area:"seafood",
      hourlyRate:225,
      scheduledStart:"10:00",
      clockIn:`${DATE_PARTTIME}T10:00:00.000Z`,
      clockOut:`${DATE_PARTTIME}T16:00:00.000Z`,
      breakMinutes:0,
      note:"payroll history r1 parttime",
    }
  );
  module.payroll.latePenaltyEnabled = true;
  module.payroll.lateGraceMinutes = 5;
  module.payroll.latePenaltyAmount = 30;
  module.payroll.latePenaltyMode = "fixed";
});
assert.equal(seed.response.status, 200, `history seed failed: ${JSON.stringify(seed.data)}`);

for (const id of [EMPLOYEE_ROW, PARTTIME_ROW]) {
  const approved = await request(`/api/workforce/${SITE}/attendance/${id}/approve`, { method:"POST", cookie:manager });
  assert.equal(approved.response.status, 200, `attendance approval failed for ${id}: ${JSON.stringify(approved.data)}`);
}

const supervisorLock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:supervisor,
});
assert.equal(supervisorLock.response.status, 403, "supervisor must not create payroll history revision");
assert.equal(supervisorLock.data.error, "WORKFORCE_MANAGER_REQUIRED");

const lock1 = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager,
});
assert.equal(lock1.response.status, 200, `r1 lock failed: ${JSON.stringify(lock1.data)}`);
assert.equal(lock1.data.unchanged, false);
assert.equal(lock1.data.period.currentRevision, 1);
assert.equal(lock1.data.period.history.length, 1);
const r1 = structuredClone(lock1.data.period.history[0]);
assert.equal(r1.id, `${MONTH}-r1`);
assert.equal(r1.revision, 1);
assert.equal(r1.formulaVersion, 1);
assert.equal(r1.currency, "TWD");
assert.equal(r1.approvedAttendanceIds.length, 2);
assert.equal(r1.attendanceRows.length, 2);
assert.equal(r1.staffRows.length, 2);
assert.equal(r1.totals.shifts, 2);
assert.equal(r1.totals.workedMinutes, 810);
assert.equal(r1.totals.workedHours, 13.5);
assert.equal(r1.totals.gross, 3000);
assert.equal(r1.totals.deduction, 30);
assert.equal(r1.totals.net, 2970);
const r1Employee = r1.attendanceRows.find((row) => row.attendanceId === EMPLOYEE_ROW);
assert.equal(r1Employee.workedMinutes, 450);
assert.equal(r1Employee.gross, 1650);
assert.equal(r1Employee.lateMinutes, 15);
assert.equal(r1Employee.deduction, 30);
assert.equal(r1Employee.net, 1620);

const duplicateLock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager,
});
assert.equal(duplicateLock.response.status, 200);
assert.equal(duplicateLock.data.unchanged, true, "repeated lock must be idempotent");
assert.equal(duplicateLock.data.period.history.length, 1, "repeated lock created duplicate history revision");

let employeeState = await readState(employee);
const employeePeriod = employeeState.modules.attendance.payroll.periods[MONTH];
assert(employeePeriod, "employee safe period status missing");
assert.equal(employeePeriod.status, "locked");
assert.equal(employeePeriod.history, undefined, "self-service response leaked payroll history");
assert.equal(employeePeriod.currentRevision, undefined, "self-service response leaked current payroll revision");
assert.equal(employeePeriod.lockedByName, undefined, "self-service response leaked payroll lock actor");

const reopen = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/reopen`, {
  method:"POST",
  cookie:manager,
  body:{ reason:"Correct employee clock-in evidence" },
});
assert.equal(reopen.response.status, 200, `reopen failed: ${JSON.stringify(reopen.data)}`);
assert.equal(reopen.data.period.history.length, 1, "reopen must preserve r1");

const forgeHistory = await saveAttendance(manager, (module) => {
  module.payroll.periods[MONTH].history = [];
});
assert.equal(forgeHistory.response.status, 403, "generic attendance write must not delete payroll history");
assert.equal(forgeHistory.data.error, "WORKFORCE_PAYROLL_PERIOD_DIRECT_EDIT_NOT_ALLOWED");

const correction = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:employee,
  body:{
    attendanceId:EMPLOYEE_ROW,
    clockIn:`${DATE_EMPLOYEE}T10:00:00.000Z`,
    clockOut:`${DATE_EMPLOYEE}T18:00:00.000Z`,
    breakMinutes:30,
    note:"payroll history r2 corrected",
    reason:"Clock-in evidence corrected before payroll relock",
  },
});
assert.equal(correction.response.status, 200, `correction create failed: ${JSON.stringify(correction.data)}`);
const correctionId = correction.data.correctionRequest.id;
const correctionApproved = await request(`/api/workforce/${SITE}/attendance-corrections/${correctionId}/approve`, {
  method:"POST",
  cookie:manager,
  body:{ note:"Evidence verified for payroll relock" },
});
assert.equal(correctionApproved.response.status, 200, `correction approve failed: ${JSON.stringify(correctionApproved.data)}`);

let managerState = await readState(manager);
const corrected = managerState.modules.attendance.attendance.find((entry) => entry.id === EMPLOYEE_ROW);
assert.equal(corrected.approvalStatus, undefined, "approved correction must invalidate attendance approval");
const reapprove = await request(`/api/workforce/${SITE}/attendance/${EMPLOYEE_ROW}/approve`, {
  method:"POST",
  cookie:manager,
});
assert.equal(reapprove.response.status, 200, `corrected attendance reapproval failed: ${JSON.stringify(reapprove.data)}`);

const lock2 = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager,
});
assert.equal(lock2.response.status, 200, `r2 lock failed: ${JSON.stringify(lock2.data)}`);
assert.equal(lock2.data.period.currentRevision, 2);
assert.equal(lock2.data.period.history.length, 2);
assert.deepEqual(lock2.data.period.history[0], r1, "r1 must remain immutable after reopen/relock");
const r2 = lock2.data.period.history[1];
assert.equal(r2.id, `${MONTH}-r2`);
assert.equal(r2.revision, 2);
assert.equal(r2.totals.shifts, 2);
assert.equal(r2.totals.workedMinutes, 810);
assert.equal(r2.totals.gross, 3000);
assert.equal(r2.totals.deduction, 0);
assert.equal(r2.totals.net, 3000);
assert.equal(r2.sourceReopen.reason, "Correct employee clock-in evidence");
const r2Employee = r2.attendanceRows.find((row) => row.attendanceId === EMPLOYEE_ROW);
assert.equal(r2Employee.clockIn, `${DATE_EMPLOYEE}T10:00:00.000Z`);
assert.equal(r2Employee.lateMinutes, 0);
assert.equal(r2Employee.deduction, 0);
assert.equal(r2Employee.net, 1650);

employeeState = await readState(employee);
assert.equal(employeeState.modules.attendance.payroll.periods[MONTH].history, undefined, "self-service response leaked r2 history");
assert.equal(employeeState.modules.attendance.payroll.periods[MONTH].currentRevision, undefined, "self-service response leaked r2 current revision");

const deleteHistoryAfterLock = await saveAttendance(manager, (module) => {
  module.payroll.periods[MONTH].history = [];
});
assert.equal(deleteHistoryAfterLock.response.status, 403, "generic write deleted locked payroll history");

managerState = await readState(manager);
assert.equal(managerState.modules.attendance.payroll.periods[MONTH].history.length, 2);
assert.deepEqual(managerState.modules.attendance.payroll.periods[MONTH].history[0], r1);
assert.deepEqual(managerState.modules.attendance.payroll.periods[MONTH].history[1], r2);

console.log("WORKFORCE_PAYROLL_HISTORY_API_REGRESSION_OK");
