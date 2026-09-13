import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const EMPLOYEE_ID = "staff-employee";
const PARTTIME_ID = "staff-parttime";

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

function attendanceRow(id, date, staffId, staffName, clockIn, clockOut, note) {
  return {
    id,
    date,
    staffId,
    staffName,
    area:staffId === PARTTIME_ID ? "seafood" : "soup",
    hourlyRate:staffId === PARTTIME_ID ? 225 : 220,
    scheduledStart:"10:00",
    clockIn,
    clockOut,
    breakMinutes:0,
    note,
  };
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const parttime = await login("parttimefx");

const LOCK_MONTH = "2034-01";
const LOCK_DATE = `${LOCK_MONTH}-05`;
const LOCK_ID = "correction-lock-employee";
const PARTTIME_DATE = "2034-02-05";
const PARTTIME_ROW_ID = "correction-parttime-cancel";
const STALE_DATE = "2034-03-05";
const STALE_ID = "correction-stale-employee";
const REJECT_DATE = "2034-04-05";
const REJECT_ID = "correction-reject-employee";

const seed = await saveAttendance(admin.cookie, (module) => {
  const ids = new Set([LOCK_ID, PARTTIME_ROW_ID, STALE_ID, REJECT_ID]);
  module.attendance = module.attendance.filter((entry) => !ids.has(String(entry?.id || "")));
  module.attendance.unshift(
    attendanceRow(LOCK_ID, LOCK_DATE, EMPLOYEE_ID, "employeefx", `${LOCK_DATE}T02:00:00.000Z`, `${LOCK_DATE}T10:00:00.000Z`, "lock correction source"),
    attendanceRow(PARTTIME_ROW_ID, PARTTIME_DATE, PARTTIME_ID, "parttimefx", `${PARTTIME_DATE}T09:00:00.000Z`, `${PARTTIME_DATE}T15:00:00.000Z`, "part-time correction source"),
    attendanceRow(STALE_ID, STALE_DATE, EMPLOYEE_ID, "employeefx", `${STALE_DATE}T02:00:00.000Z`, `${STALE_DATE}T10:00:00.000Z`, "stale correction source"),
    attendanceRow(REJECT_ID, REJECT_DATE, EMPLOYEE_ID, "employeefx", `${REJECT_DATE}T02:00:00.000Z`, `${REJECT_DATE}T10:00:00.000Z`, "reject correction source"),
  );
  // Generic attendance writes do not own correction request workflow state.
  module.correctionRequests = [{ id:"forged-correction", status:"approved" }];
});
assert.equal(seed.response.status, 200, `attendance seed failed: ${JSON.stringify(seed.data)}`);
let managerState = await readState(manager.cookie);
assert.deepEqual(managerState.modules.attendance.correctionRequests || [], [], "generic attendance write forged correction workflow state");

const approveAttendance = await request(`/api/workforce/${SITE}/attendance/${LOCK_ID}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(approveAttendance.response.status, 200, `source attendance approval failed: ${JSON.stringify(approveAttendance.data)}`);

const noChange = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:employee.cookie,
  body:{
    attendanceId:REJECT_ID,
    clockIn:`${REJECT_DATE}T02:00:00.000Z`,
    clockOut:`${REJECT_DATE}T10:00:00.000Z`,
    breakMinutes:0,
    note:"reject correction source",
    reason:"This must be rejected as unchanged",
  },
});
assert.equal(noChange.response.status, 409, "unchanged correction must fail closed");
assert.equal(noChange.data.error, "WORKFORCE_CORRECTION_NO_CHANGES");

const correctionCreate = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:employee.cookie,
  body:{
    attendanceId:LOCK_ID,
    staffId:PARTTIME_ID,
    staffName:"spoofed-parttime",
    status:"approved",
    createdByUserId:"spoofed-user",
    clockIn:`${LOCK_DATE}T02:15:00.000Z`,
    clockOut:`${LOCK_DATE}T10:15:00.000Z`,
    breakMinutes:30,
    note:"employee requested correction",
    reason:"Forgot to record the actual break",
  },
});
assert.equal(correctionCreate.response.status, 200, `employee correction create failed: ${JSON.stringify(correctionCreate.data)}`);
const correction = correctionCreate.data.correctionRequest;
assert(correction?.id, "correction request id missing");
assert.equal(correction.staffId, EMPLOYEE_ID, "correction staff identity must be server resolved");
assert.equal(correction.staffName, "employeefx", "correction staff name must be server canonical");
assert.equal(correction.status, "pending", "client must not forge correction status");
assert.notEqual(correction.createdByUserId, "spoofed-user", "client must not forge correction actor");
assert.equal(correction.sourceSnapshot.clockIn, `${LOCK_DATE}T02:00:00.000Z`);
assert.equal(correction.requested.breakMinutes, 30);
assert(Number.isInteger(correctionCreate.data.moduleRevision), "correction create must return attendance module revision");

let employeeState = await readState(employee.cookie);
assert(employeeState.modules.attendance.attendance.every((entry) => entry.staffId === EMPLOYEE_ID), "employee received coworker attendance rows");
assert.deepEqual(employeeState.modules.attendance.correctionRequests.map((entry) => entry.id), [correction.id], "employee must see only own correction requests");

const supervisorApprove = await request(`/api/workforce/${SITE}/attendance-corrections/${correction.id}/approve`, {
  method:"POST",
  cookie:supervisor.cookie,
});
assert.equal(supervisorApprove.response.status, 403, "supervisor must not approve attendance corrections");
assert.equal(supervisorApprove.data.error, "WORKFORCE_MANAGER_REQUIRED");

const employeeApprove = await request(`/api/workforce/${SITE}/attendance-corrections/${correction.id}/approve`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(employeeApprove.response.status, 403, "employee must not approve own correction");

const genericPreservation = await saveAttendance(manager.cookie, (module) => {
  module.correctionRequests = [];
  const row = module.attendance.find((entry) => entry.id === REJECT_ID);
  row.note = "manager generic edit while preserving correction workflow";
});
assert.equal(genericPreservation.response.status, 200, `generic attendance preservation edit failed: ${JSON.stringify(genericPreservation.data)}`);
managerState = await readState(manager.cookie);
assert(managerState.modules.attendance.correctionRequests.some((entry) => entry.id === correction.id), "generic attendance write deleted server-owned correction request");

const lock = await request(`/api/workforce/${SITE}/payroll-periods/${LOCK_MONTH}/lock`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(lock.response.status, 200, `payroll period lock failed: ${JSON.stringify(lock.data)}`);

const lockedApproval = await request(`/api/workforce/${SITE}/attendance-corrections/${correction.id}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(lockedApproval.response.status, 409, "locked payroll period must block correction approval");
assert.equal(lockedApproval.data.error, "WORKFORCE_PAYROLL_PERIOD_LOCKED");

const reopen = await request(`/api/workforce/${SITE}/payroll-periods/${LOCK_MONTH}/reopen`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ reason:"Correction regression requires reopening" },
});
assert.equal(reopen.response.status, 200, `payroll period reopen failed: ${JSON.stringify(reopen.data)}`);

const approvedCorrection = await request(`/api/workforce/${SITE}/attendance-corrections/${correction.id}/approve`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"Source verified" },
});
assert.equal(approvedCorrection.response.status, 200, `correction approval failed: ${JSON.stringify(approvedCorrection.data)}`);
assert.equal(approvedCorrection.data.correctionRequest.status, "approved");
assert(approvedCorrection.data.correctionRequest.decidedByUserId, "correction decision actor must be server generated");

managerState = await readState(manager.cookie);
const correctedRow = managerState.modules.attendance.attendance.find((entry) => entry.id === LOCK_ID);
assert(correctedRow, "corrected attendance row missing");
assert.equal(correctedRow.clockIn, `${LOCK_DATE}T02:15:00.000Z`);
assert.equal(correctedRow.clockOut, `${LOCK_DATE}T10:15:00.000Z`);
assert.equal(correctedRow.breakMinutes, 30);
assert.equal(correctedRow.note, "employee requested correction");
assert.equal(correctedRow.approvalStatus, undefined, "corrected row must lose approved status");
assert.equal(correctedRow.approvedAt, undefined, "corrected row must lose approval timestamp");
assert.equal(correctedRow.approvedByUserId, undefined, "corrected row must lose approval actor");

const parttimeCorrection = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:parttime.cookie,
  body:{
    attendanceId:PARTTIME_ROW_ID,
    clockIn:`${PARTTIME_DATE}T09:10:00.000Z`,
    clockOut:`${PARTTIME_DATE}T15:00:00.000Z`,
    breakMinutes:0,
    note:"part-time correction",
    reason:"Clock-in was ten minutes late",
  },
});
assert.equal(parttimeCorrection.response.status, 200, `part-time correction create failed: ${JSON.stringify(parttimeCorrection.data)}`);
const parttimeCorrectionId = parttimeCorrection.data.correctionRequest.id;
assert.equal(parttimeCorrection.data.correctionRequest.staffId, PARTTIME_ID);

employeeState = await readState(employee.cookie);
assert(employeeState.modules.attendance.correctionRequests.every((entry) => entry.staffId === EMPLOYEE_ID), "employee correction privacy regressed");
const parttimeState = await readState(parttime.cookie);
assert(parttimeState.modules.attendance.correctionRequests.every((entry) => entry.staffId === PARTTIME_ID), "part-time correction privacy regressed");
assert(parttimeState.modules.attendance.correctionRequests.some((entry) => entry.id === parttimeCorrectionId), "part-time must see own correction request");

const crossCancel = await request(`/api/workforce/${SITE}/attendance-corrections/${parttimeCorrectionId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(crossCancel.response.status, 403, "employee must not cancel another staff correction");
assert.equal(crossCancel.data.error, "WORKFORCE_CORRECTION_NOT_OWN");

const ownerCancel = await request(`/api/workforce/${SITE}/attendance-corrections/${parttimeCorrectionId}/cancel`, {
  method:"POST",
  cookie:parttime.cookie,
});
assert.equal(ownerCancel.response.status, 200, `owner correction cancel failed: ${JSON.stringify(ownerCancel.data)}`);
assert.equal(ownerCancel.data.correctionRequest.status, "cancelled");

const staleCreate = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:employee.cookie,
  body:{
    attendanceId:STALE_ID,
    clockIn:`${STALE_DATE}T02:10:00.000Z`,
    clockOut:`${STALE_DATE}T10:00:00.000Z`,
    breakMinutes:0,
    note:"stale request",
    reason:"Request before manager changes source",
  },
});
assert.equal(staleCreate.response.status, 200, `stale correction create failed: ${JSON.stringify(staleCreate.data)}`);
const staleId = staleCreate.data.correctionRequest.id;

const sourceChange = await saveAttendance(manager.cookie, (module) => {
  const row = module.attendance.find((entry) => entry.id === STALE_ID);
  row.note = "manager changed source after request";
});
assert.equal(sourceChange.response.status, 200, `source change failed: ${JSON.stringify(sourceChange.data)}`);
const staleApproval = await request(`/api/workforce/${SITE}/attendance-corrections/${staleId}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(staleApproval.response.status, 409, "stale attendance source must block correction approval");
assert.equal(staleApproval.data.error, "WORKFORCE_CORRECTION_SOURCE_CHANGED");
const staleCancel = await request(`/api/workforce/${SITE}/attendance-corrections/${staleId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(staleCancel.response.status, 200, "owner must be able to cancel stale pending correction");

const rejectCreate = await request(`/api/workforce/${SITE}/attendance-corrections`, {
  method:"POST",
  cookie:employee.cookie,
  body:{
    attendanceId:REJECT_ID,
    clockIn:`${REJECT_DATE}T02:20:00.000Z`,
    clockOut:`${REJECT_DATE}T10:00:00.000Z`,
    breakMinutes:0,
    note:"reject request",
    reason:"Testing manager rejection",
  },
});
assert.equal(rejectCreate.response.status, 200, `reject correction create failed: ${JSON.stringify(rejectCreate.data)}`);
const rejectRequestId = rejectCreate.data.correctionRequest.id;
const rejectWithoutNote = await request(`/api/workforce/${SITE}/attendance-corrections/${rejectRequestId}/reject`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"" },
});
assert.equal(rejectWithoutNote.response.status, 400, "correction rejection must require a decision note");
assert.equal(rejectWithoutNote.data.error, "WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED");
const rejected = await request(`/api/workforce/${SITE}/attendance-corrections/${rejectRequestId}/reject`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"Timesheet evidence does not match" },
});
assert.equal(rejected.response.status, 200, `correction rejection failed: ${JSON.stringify(rejected.data)}`);
assert.equal(rejected.data.correctionRequest.status, "rejected");
assert.equal(rejected.data.correctionRequest.decisionNote, "Timesheet evidence does not match");
const cancelRejected = await request(`/api/workforce/${SITE}/attendance-corrections/${rejectRequestId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(cancelRejected.response.status, 409, "processed correction cannot be cancelled");
assert.equal(cancelRejected.data.error, "WORKFORCE_CORRECTION_NOT_PENDING");

const finalState = await readState(manager.cookie);
assert(finalState.modules.attendance.correctionRequests.some((entry) => entry.id === correction.id && entry.status === "approved"), "approved correction missing from VPS state");
assert(finalState.modules.attendance.correctionRequests.some((entry) => entry.id === parttimeCorrectionId && entry.status === "cancelled"), "cancelled correction missing from VPS state");
assert(finalState.modules.attendance.correctionRequests.some((entry) => entry.id === rejectRequestId && entry.status === "rejected"), "rejected correction missing from VPS state");

console.log("WORKFORCE_CORRECTION_API_REGRESSION_OK");
