import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const MONTH = "2026-10";
const ATTENDANCE_ID = "workforce-approval-regression";

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
  return { cookie:result.cookie, user:result.data.user };
}

async function readState(cookie) {
  const result = await request(`/api/business-state/${SITE}`, { cookie });
  assert.equal(result.response.status, 200, `business-state read failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function saveAttendance(cookie, mutate) {
  const state = await readState(cookie);
  const module = structuredClone(state.modules.attendance || { attendance:[], payroll:{} });
  module.attendance ??= [];
  module.payroll ??= {};
  mutate(module);
  const expected = state.moduleRevisions.attendance;
  assert(Number.isInteger(expected), "attendance module revision missing");
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:{ attendance:module }, expectedModuleRevisions:{ attendance:expected } },
  });
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const employee = await login("employeefx");

const seed = await saveAttendance(admin.cookie, (module) => {
  module.attendance = module.attendance.filter((entry) => !String(entry?.date || "").startsWith(`${MONTH}-`));
  module.attendance.unshift({
    id:ATTENDANCE_ID,
    date:`${MONTH}-03`,
    staffId:"staff-a",
    staffName:"A",
    area:"noodles",
    hourlyRate:230,
    scheduledStart:"10:00",
    clockIn:`${MONTH}-03T02:00:00.000Z`,
    clockOut:`${MONTH}-03T10:00:00.000Z`,
    breakMinutes:60,
    note:"approval regression seed",
  });
});
assert.equal(seed.response.status, 200, `attendance seed failed: ${JSON.stringify(seed.data)}`);

const employeeApprove = await request(`/api/workforce/${SITE}/attendance/${ATTENDANCE_ID}/approve`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(employeeApprove.response.status, 403, "employee must not approve attendance");
assert.equal(employeeApprove.data.error, "WORKFORCE_MANAGER_REQUIRED");

const prematureLock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(prematureLock.response.status, 409, "unapproved attendance must block payroll lock");
assert.equal(prematureLock.data.error, "WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS");

const approval = await request(`/api/workforce/${SITE}/attendance/${ATTENDANCE_ID}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(approval.response.status, 200, `manager approval failed: ${JSON.stringify(approval.data)}`);
assert.equal(approval.data.approval.approvalStatus, "approved");
assert(approval.data.approval.approvedAt, "server approval timestamp missing");
assert(approval.data.approval.approvedByName, "server approval actor missing");

let state = await readState(admin.cookie);
let row = state.modules.attendance.attendance.find((entry) => entry.id === ATTENDANCE_ID);
assert.equal(row.approvalStatus, "approved");
assert(row.approvedByUserId, "server-owned approver id missing");

const lock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(lock.response.status, 200, `payroll lock failed: ${JSON.stringify(lock.data)}`);
assert.equal(lock.data.period.status, "locked");
assert.equal(lock.data.period.month, MONTH);
assert(lock.data.period.lockedAt, "lock timestamp missing");
assert(lock.data.period.lockedByUserId, "lock actor id missing");
assert(lock.data.period.policySnapshot && typeof lock.data.period.policySnapshot === "object", "payroll policy snapshot missing");
assert.equal(Object.hasOwn(lock.data.period.policySnapshot, "periods"), false, "policy snapshot must not recursively include periods");
assert(lock.data.period.approvedAttendanceIds.includes(ATTENDANCE_ID), "locked period must identify approved attendance rows");

const directPeriodEdit = await saveAttendance(manager.cookie, (module) => {
  module.payroll.periods[MONTH].status = "open";
});
assert.equal(directPeriodEdit.response.status, 403, "generic business-state write must not mutate payroll period state");
assert.equal(directPeriodEdit.data.error, "WORKFORCE_PAYROLL_PERIOD_DIRECT_EDIT_NOT_ALLOWED");

const lockedCorrection = await saveAttendance(manager.cookie, (module) => {
  const target = module.attendance.find((entry) => entry.id === ATTENDANCE_ID);
  target.note = "must not change while locked";
});
assert.equal(lockedCorrection.response.status, 409, "locked attendance must reject manager correction");
assert.equal(lockedCorrection.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");

const employeeState = await readState(employee.cookie);
const ownRows = structuredClone(employeeState.modules.attendance.attendance || []);
const lockedEmployeeClockIn = await request(`/api/business-state/${SITE}`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ modules:{ attendance:{
    attendance:[{
      id:"workforce-locked-self-clock",
      date:`${MONTH}-05`,
      staffId:"staff-employee",
      staffName:"tampered",
      area:"meat",
      hourlyRate:9999,
      scheduledStart:"23:59",
      clockIn:`${MONTH}-05T09:00:00.000Z`,
      clockOut:null,
      breakMinutes:999,
      note:"must be rejected because month is locked",
    }, ...ownRows],
    payroll:structuredClone(employeeState.modules.attendance.payroll || {}),
  } } },
});
assert.equal(lockedEmployeeClockIn.response.status, 409, "self-service clock-in must not write into a locked month");
assert.equal(lockedEmployeeClockIn.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");

const reopenMissingReason = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/reopen`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ reason:"" },
});
assert.equal(reopenMissingReason.response.status, 400, "reopen must require a reason");
assert.equal(reopenMissingReason.data.error, "WORKFORCE_REOPEN_REASON_REQUIRED");

const reopen = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/reopen`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ reason:"Correct recorded break minutes" },
});
assert.equal(reopen.response.status, 200, `payroll reopen failed: ${JSON.stringify(reopen.data)}`);
assert.equal(reopen.data.period.status, "open");
assert.equal(reopen.data.period.reopenReason, "Correct recorded break minutes");
assert(reopen.data.period.reopenedByUserId, "reopen actor id missing");

const correction = await saveAttendance(manager.cookie, (module) => {
  const target = module.attendance.find((entry) => entry.id === ATTENDANCE_ID);
  target.breakMinutes = 30;
  target.note = "corrected after audited reopen";
});
assert.equal(correction.response.status, 200, `open-period correction failed: ${JSON.stringify(correction.data)}`);

state = await readState(admin.cookie);
row = state.modules.attendance.attendance.find((entry) => entry.id === ATTENDANCE_ID);
assert.equal(row.breakMinutes, 30);
assert.equal(row.approvalStatus, undefined, "correction must invalidate prior approval");
assert.equal(row.approvedAt, undefined, "correction must clear approval timestamp");
assert.equal(state.modules.attendance.payroll.periods[MONTH].status, "open");

const relockBeforeReapproval = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(relockBeforeReapproval.response.status, 409, "corrected attendance must require re-approval before lock");
assert.equal(relockBeforeReapproval.data.error, "WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS");

const reapproval = await request(`/api/workforce/${SITE}/attendance/${ATTENDANCE_ID}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(reapproval.response.status, 200);
const relock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(relock.response.status, 200);
assert.equal(relock.data.period.status, "locked");

console.log("WORKFORCE_APPROVAL_API_REGRESSION_OK");