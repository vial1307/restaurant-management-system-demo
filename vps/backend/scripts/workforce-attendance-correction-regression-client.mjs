import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const MONTH = "2031-01";
const STAFF_ID = "staff-correction-employee";
const OTHER_STAFF_ID = "staff-correction-other";
const ATTENDANCE_ID = "attendance-correction-regression";

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

async function saveModules(cookie, mutator) {
  const state = await readState(cookie);
  const modules = structuredClone(state.modules || {});
  const changed = mutator(modules) || [];
  const bodyModules = Object.fromEntries(changed.map((name) => [name, modules[name]]));
  const expectedModuleRevisions = Object.fromEntries(changed.map((name) => [name, state.moduleRevisions[name]]));
  const result = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:bodyModules, expectedModuleRevisions },
  });
  return result;
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");

const seed = await saveModules(admin.cookie, (modules) => {
  modules.shared ??= {};
  modules.shared.staff = Array.isArray(modules.shared.staff) ? modules.shared.staff : [];
  modules.shared.staff = modules.shared.staff.filter((entry) => ![STAFF_ID, OTHER_STAFF_ID].includes(String(entry?.id || "")));
  modules.shared.staff.push(
    { id:STAFF_ID, name:"employeefx", area:"noodles", hourlyRate:230, accountUsername:"employeefx" },
    { id:OTHER_STAFF_ID, name:"Other staff", area:"meat", hourlyRate:250, accountUsername:"parttimefx" },
  );
  modules.attendance ??= { attendance:[], payroll:{} };
  modules.attendance.attendance = Array.isArray(modules.attendance.attendance) ? modules.attendance.attendance : [];
  modules.attendance.payroll ??= {};
  modules.attendance.payroll.periods ??= {};
  delete modules.attendance.payroll.periods[MONTH];
  modules.attendance.attendance = modules.attendance.attendance.filter((entry) => !String(entry?.date || "").startsWith(`${MONTH}-`));
  modules.attendance.attendance.unshift({
    id:ATTENDANCE_ID,
    date:`${MONTH}-08`,
    staffId:STAFF_ID,
    staffName:"employeefx",
    area:"noodles",
    hourlyRate:230,
    scheduledStart:"10:00",
    clockIn:`${MONTH}-08T02:00:00.000Z`,
    clockOut:`${MONTH}-08T10:00:00.000Z`,
    breakMinutes:60,
    note:"attendance correction seed",
  });
  modules.attendance.correctionRequests = [];
  return ["shared", "attendance"];
});
assert.equal(seed.response.status, 200, `correction seed failed: ${JSON.stringify(seed.data)}`);

const spoofedField = await request(`/api/workforce/${SITE}/attendance-correction-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ attendanceId:ATTENDANCE_ID, reason:"try pay rate edit", changes:{ hourlyRate:9999 } },
});
assert.equal(spoofedField.response.status, 400, "employee correction must reject hourlyRate");
assert.equal(spoofedField.data.error, "WORKFORCE_ATTENDANCE_CORRECTION_CHANGES_INVALID");

const invalidRange = await request(`/api/workforce/${SITE}/attendance-correction-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ attendanceId:ATTENDANCE_ID, reason:"bad time range", changes:{ clockOut:`${MONTH}-08T01:00:00.000Z` } },
});
assert.equal(invalidRange.response.status, 400, "correction must reject clock-out before clock-in");
assert.equal(invalidRange.data.error, "WORKFORCE_ATTENDANCE_CORRECTION_RANGE_INVALID");

const created = await request(`/api/workforce/${SITE}/attendance-correction-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ attendanceId:ATTENDANCE_ID, reason:"Break was thirty minutes", changes:{ breakMinutes:30, note:"corrected by request" } },
});
assert.equal(created.response.status, 200, `employee correction request failed: ${JSON.stringify(created.data)}`);
assert.equal(created.data.request.staffId, STAFF_ID);
assert.equal(created.data.request.status, "pending");
assert.equal(created.data.request.changes.breakMinutes, 30);
assert(created.data.request.createdAt, "server request timestamp missing");
const requestId = created.data.request.id;

const employeeState = await readState(employee.cookie);
assert.equal(employeeState.modules.attendance.attendance.every((entry) => entry.staffId === STAFF_ID), true, "self-service attendance leaked another staff row");
assert.equal(employeeState.modules.attendance.correctionRequests.length, 1, "self-service should see own correction request");
assert.equal(employeeState.modules.attendance.correctionRequests[0].id, requestId);

const supervisorApprove = await request(`/api/workforce/${SITE}/attendance-correction-requests/${requestId}/approve`, {
  method:"POST",
  cookie:supervisor.cookie,
});
assert.equal(supervisorApprove.response.status, 403, "supervisor must not approve attendance correction");
assert.equal(supervisorApprove.data.error, "WORKFORCE_MANAGER_REQUIRED");

const forgedGenericWrite = await saveModules(manager.cookie, (modules) => {
  modules.attendance.correctionRequests = [];
  return ["attendance"];
});
assert.equal(forgedGenericWrite.response.status, 200, `generic attendance write failed unexpectedly: ${JSON.stringify(forgedGenericWrite.data)}`);
let adminState = await readState(admin.cookie);
assert.equal(adminState.modules.attendance.correctionRequests.some((entry) => entry.id === requestId), true, "generic write must preserve server-owned correction requests");

const approved = await request(`/api/workforce/${SITE}/attendance-correction-requests/${requestId}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(approved.response.status, 200, `manager correction approval failed: ${JSON.stringify(approved.data)}`);
assert.equal(approved.data.request.status, "approved");

adminState = await readState(admin.cookie);
let row = adminState.modules.attendance.attendance.find((entry) => entry.id === ATTENDANCE_ID);
assert.equal(row.breakMinutes, 30);
assert.equal(row.note, "corrected by request");
assert.equal(row.approvalStatus, undefined, "correction approval must invalidate attendance approval");

const lockBeforeAttendanceApproval = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(lockBeforeAttendanceApproval.response.status, 409, "corrected attendance must require attendance approval before payroll lock");
assert.equal(lockBeforeAttendanceApproval.data.error, "WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS");

const attendanceApproval = await request(`/api/workforce/${SITE}/attendance/${ATTENDANCE_ID}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(attendanceApproval.response.status, 200, `attendance approval failed: ${JSON.stringify(attendanceApproval.data)}`);

const lock = await request(`/api/workforce/${SITE}/payroll-periods/${MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(lock.response.status, 200, `payroll lock failed: ${JSON.stringify(lock.data)}`);

const lockedRequest = await request(`/api/workforce/${SITE}/attendance-correction-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ attendanceId:ATTENDANCE_ID, reason:"locked period request", changes:{ breakMinutes:45 } },
});
if (lockedRequest.response.status === 200) {
  const lockedApproval = await request(`/api/workforce/${SITE}/attendance-correction-requests/${lockedRequest.data.request.id}/approve`, {
    method:"POST",
    cookie:manager.cookie,
  });
  assert.equal(lockedApproval.response.status, 409, "locked payroll period must block correction approval");
  assert.equal(lockedApproval.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");
} else {
  assert.equal(lockedRequest.response.status, 409, "locked payroll period may fail closed at request creation");
  assert.equal(lockedRequest.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");
}

console.log("WORKFORCE_ATTENDANCE_CORRECTION_API_REGRESSION_OK");
