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
  return { cookie:result.cookie, user:result.data.user };
}

async function readState(cookie) {
  const result = await request(`/api/business-state/${SITE}`, { cookie });
  assert.equal(result.response.status, 200, `business-state read failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function saveSchedule(cookie, mutate) {
  const state = await readState(cookie);
  const module = structuredClone(state.modules.schedule || { schedules:[] });
  module.schedules ??= [];
  mutate(module);
  const expected = state.moduleRevisions.schedule;
  assert(Number.isInteger(expected), "schedule module revision missing");
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:{ schedule:module }, expectedModuleRevisions:{ schedule:expected } },
  });
}

async function clockIn(cookie, { id, date, staffId }) {
  const state = await readState(cookie);
  const attendance = structuredClone(state.modules.attendance || { attendance:[], payroll:{} });
  attendance.attendance ??= [];
  attendance.payroll ??= {};
  attendance.attendance.unshift({
    id,
    date,
    staffId,
    staffName:"spoofed-name",
    area:"meat",
    hourlyRate:9999,
    scheduledStart:"23:59",
    clockIn:`${date}T09:00:00.000Z`,
    clockOut:null,
    breakMinutes:999,
    note:"workforce request regression clock-in",
  });
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:{ attendance } },
  });
}

function schedule(id, date, staffId, staffName, start="10:00", end="18:00") {
  return {
    id,
    date,
    month:date.slice(0, 7),
    weekday:new Date(`${date}T12:00:00Z`).getUTCDay(),
    applyMode:"day",
    staffId,
    staffName,
    department:"inside",
    area:staffId === PARTTIME_ID ? "seafood" : "soup",
    shift:"custom",
    start,
    end,
    note:"request regression base schedule",
  };
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const parttime = await login("parttimefx");

const CHANGE_DATE = "2026-11-03";
const PARTTIME_LEAVE_DATE = "2026-11-04";
const STALE_DATE = "2026-11-05";
const REJECT_DATE = "2026-11-06";

const seed = await saveSchedule(admin.cookie, (module) => {
  module.schedules = [
    schedule("request-employee-change", CHANGE_DATE, EMPLOYEE_ID, "employeefx", "10:00", "18:00"),
    schedule("request-parttime-base", PARTTIME_LEAVE_DATE, PARTTIME_ID, "parttimefx", "17:00", "23:00"),
    schedule("request-stale-base", STALE_DATE, EMPLOYEE_ID, "employeefx", "10:00", "18:00"),
  ];
  // Generic writes must not own workflow collections. Sending forged values is
  // intentional; the server must preserve its own request/exception state.
  module.requests = [{ id:"forged-request", status:"approved" }];
  module.exceptions = [{ id:"forged-exception", kind:"override" }];
});
assert.equal(seed.response.status, 200, `schedule seed failed: ${JSON.stringify(seed.data)}`);
let managerState = await readState(manager.cookie);
assert.deepEqual(managerState.modules.schedule.requests || [], [], "generic schedule write forged request workflow state");
assert.deepEqual(managerState.modules.schedule.exceptions || [], [], "generic schedule write forged exception workflow state");

const employeeChange = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{
    type:"change",
    date:CHANGE_DATE,
    requestedStart:"12:00",
    requestedEnd:"20:00",
    reason:"Need a later shift for class",
    staffId:PARTTIME_ID,
    staffName:"spoofed-parttime",
    status:"approved",
    createdByUserId:"spoofed-user",
  },
});
assert.equal(employeeChange.response.status, 200, `employee change request failed: ${JSON.stringify(employeeChange.data)}`);
const employeeRequestId = employeeChange.data.request.id;
assert.equal(employeeChange.data.request.staffId, EMPLOYEE_ID, "request staff identity must be server resolved");
assert.equal(employeeChange.data.request.staffName, "employeefx", "request staff name must be server canonical");
assert.equal(employeeChange.data.request.status, "pending", "client must not forge request status");
assert.notEqual(employeeChange.data.request.createdByUserId, "spoofed-user", "client must not forge request actor");
assert.equal(employeeChange.data.request.sourceScheduleId, "request-employee-change");
assert.equal(employeeChange.data.request.sourceSnapshot.start, "10:00");
assert.equal(employeeChange.data.request.sourceSnapshot.end, "18:00");

const parttimeLeave = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:parttime.cookie,
  body:{ type:"leave", date:PARTTIME_LEAVE_DATE, reason:"Personal appointment" },
});
assert.equal(parttimeLeave.response.status, 200, `part-time leave request failed: ${JSON.stringify(parttimeLeave.data)}`);
const parttimeRequestId = parttimeLeave.data.request.id;
assert.equal(parttimeLeave.data.request.staffId, PARTTIME_ID);
assert.equal(parttimeLeave.data.request.staffName, "parttimefx");

let employeeState = await readState(employee.cookie);
assert(employeeState.modules.schedule.schedules.every((entry) => entry.staffId === EMPLOYEE_ID), "employee received coworker schedules");
assert.deepEqual(employeeState.modules.schedule.requests.map((entry) => entry.id), [employeeRequestId], "employee must see only own requests");
assert.deepEqual(employeeState.modules.schedule.exceptions || [], [], "employee should not see coworker/foreign exceptions");

let parttimeState = await readState(parttime.cookie);
assert(parttimeState.modules.schedule.schedules.every((entry) => entry.staffId === PARTTIME_ID), "part-time received coworker schedules");
assert.deepEqual(parttimeState.modules.schedule.requests.map((entry) => entry.id), [parttimeRequestId], "part-time must see only own requests");

const supervisorApprove = await request(`/api/workforce/${SITE}/schedule-requests/${employeeRequestId}/approve`, {
  method:"POST",
  cookie:supervisor.cookie,
});
assert.equal(supervisorApprove.response.status, 403, "supervisor must not approve schedule requests");
assert.equal(supervisorApprove.data.error, "WORKFORCE_SCHEDULE_MANAGER_REQUIRED");

const employeeApprove = await request(`/api/workforce/${SITE}/schedule-requests/${employeeRequestId}/approve`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(employeeApprove.response.status, 403, "employee must not approve schedule requests");

const crossCancel = await request(`/api/workforce/${SITE}/schedule-requests/${parttimeRequestId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(crossCancel.response.status, 403, "employee must not cancel another staff request");
assert.equal(crossCancel.data.error, "WORKFORCE_REQUEST_NOT_OWN");

const approveChange = await request(`/api/workforce/${SITE}/schedule-requests/${employeeRequestId}/approve`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"Coverage checked" },
});
assert.equal(approveChange.response.status, 200, `manager approval failed: ${JSON.stringify(approveChange.data)}`);
assert.equal(approveChange.data.request.status, "approved");
assert(approveChange.data.request.exceptionId, "approved request must reference its exception");
assert(approveChange.data.request.decidedByUserId, "approval actor must be server generated");

managerState = await readState(manager.cookie);
let employeeException = managerState.modules.schedule.exceptions.find((entry) => entry.requestId === employeeRequestId);
assert(employeeException, "approved change exception missing");
assert.equal(employeeException.kind, "override");
assert.equal(employeeException.staffId, EMPLOYEE_ID);
assert.equal(employeeException.date, CHANGE_DATE);
assert.equal(employeeException.start, "12:00");
assert.equal(employeeException.end, "20:00");
assert.equal(employeeException.sourceScheduleId, "request-employee-change");
assert(employeeException.approvedByUserId, "exception approval actor missing");

const duplicateRequest = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ type:"change", date:CHANGE_DATE, requestedStart:"13:00", requestedEnd:"21:00", reason:"Second request must not stack" },
});
assert.equal(duplicateRequest.response.status, 200);
const duplicateApproval = await request(`/api/workforce/${SITE}/schedule-requests/${duplicateRequest.data.request.id}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(duplicateApproval.response.status, 409, "second active exception must not stack");
assert.equal(duplicateApproval.data.error, "WORKFORCE_REQUEST_EXCEPTION_EXISTS");
const duplicateCancel = await request(`/api/workforce/${SITE}/schedule-requests/${duplicateRequest.data.request.id}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(duplicateCancel.response.status, 200, "owner should be able to cancel duplicate pending request after blocked approval");

const genericTamper = await saveSchedule(manager.cookie, (module) => {
  module.requests = [];
  module.exceptions = [];
  const base = module.schedules.find((entry) => entry.id === "request-parttime-base");
  base.note = "manager edited base schedule without owning workflow collections";
});
assert.equal(genericTamper.response.status, 200, `generic schedule edit failed: ${JSON.stringify(genericTamper.data)}`);
managerState = await readState(manager.cookie);
assert(managerState.modules.schedule.requests.some((entry) => entry.id === employeeRequestId && entry.status === "approved"), "generic write deleted approved request");
assert(managerState.modules.schedule.requests.some((entry) => entry.id === parttimeRequestId && entry.status === "pending"), "generic write deleted pending request");
assert(managerState.modules.schedule.exceptions.some((entry) => entry.requestId === employeeRequestId), "generic write deleted server-owned exception");

const staleRequest = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ type:"change", date:STALE_DATE, requestedStart:"11:00", requestedEnd:"19:00", reason:"Request before schedule changes" },
});
assert.equal(staleRequest.response.status, 200, `stale test request create failed: ${JSON.stringify(staleRequest.data)}`);
const staleRequestId = staleRequest.data.request.id;
const changeBase = await saveSchedule(manager.cookie, (module) => {
  const base = module.schedules.find((entry) => entry.id === "request-stale-base");
  base.start = "10:30";
});
assert.equal(changeBase.response.status, 200);
const staleApproval = await request(`/api/workforce/${SITE}/schedule-requests/${staleRequestId}/approve`, {
  method:"POST",
  cookie:manager.cookie,
});
assert.equal(staleApproval.response.status, 409, "stale source schedule must block approval");
assert.equal(staleApproval.data.error, "WORKFORCE_REQUEST_SCHEDULE_CHANGED");
const staleCancel = await request(`/api/workforce/${SITE}/schedule-requests/${staleRequestId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(staleCancel.response.status, 200);

const rejectRequest = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ type:"leave", date:REJECT_DATE, reason:"Need a day off" },
});
assert.equal(rejectRequest.response.status, 200);
const rejectId = rejectRequest.data.request.id;
const rejectWithoutNote = await request(`/api/workforce/${SITE}/schedule-requests/${rejectId}/reject`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"" },
});
assert.equal(rejectWithoutNote.response.status, 400, "reject must require decision note");
assert.equal(rejectWithoutNote.data.error, "WORKFORCE_REQUEST_DECISION_NOTE_REQUIRED");
const rejected = await request(`/api/workforce/${SITE}/schedule-requests/${rejectId}/reject`, {
  method:"POST",
  cookie:manager.cookie,
  body:{ note:"Coverage is insufficient" },
});
assert.equal(rejected.response.status, 200);
assert.equal(rejected.data.request.status, "rejected");
assert.equal(rejected.data.request.decisionNote, "Coverage is insufficient");
const cancelRejected = await request(`/api/workforce/${SITE}/schedule-requests/${rejectId}/cancel`, {
  method:"POST",
  cookie:employee.cookie,
});
assert.equal(cancelRejected.response.status, 409, "processed request cannot be cancelled");
assert.equal(cancelRejected.data.error, "WORKFORCE_REQUEST_NOT_PENDING");

const approveLeave = await request(`/api/workforce/${SITE}/schedule-requests/${parttimeRequestId}/approve`, {
  method:"POST",
  cookie:admin.cookie,
});
assert.equal(approveLeave.response.status, 200, `admin leave approval failed: ${JSON.stringify(approveLeave.data)}`);
managerState = await readState(manager.cookie);
const leaveException = managerState.modules.schedule.exceptions.find((entry) => entry.requestId === parttimeRequestId);
assert(leaveException, "approved leave exception missing");
assert.equal(leaveException.kind, "leave");
assert.equal(leaveException.staffId, PARTTIME_ID);

employeeState = await readState(employee.cookie);
assert(employeeState.modules.schedule.requests.every((entry) => entry.staffId === EMPLOYEE_ID), "employee request privacy regressed after decisions");
assert(employeeState.modules.schedule.exceptions.every((entry) => entry.staffId === EMPLOYEE_ID), "employee exception privacy regressed");
assert(employeeState.modules.schedule.exceptions.some((entry) => entry.requestId === employeeRequestId), "employee must see own approved exception");
parttimeState = await readState(parttime.cookie);
assert(parttimeState.modules.schedule.requests.every((entry) => entry.staffId === PARTTIME_ID), "part-time request privacy regressed");
assert(parttimeState.modules.schedule.exceptions.every((entry) => entry.staffId === PARTTIME_ID), "part-time exception privacy regressed");
assert(parttimeState.modules.schedule.exceptions.some((entry) => entry.requestId === parttimeRequestId), "part-time must see own leave exception");

const overrideClockId = "workforce-request-override-clock";
const overrideClock = await clockIn(employee.cookie, { id:overrideClockId, date:CHANGE_DATE, staffId:EMPLOYEE_ID });
assert.equal(overrideClock.response.status, 200, `override clock-in failed: ${JSON.stringify(overrideClock.data)}`);
let adminState = await readState(admin.cookie);
let clockRow = adminState.modules.attendance.attendance.find((entry) => entry.id === overrideClockId);
assert(clockRow, "override clock-in row missing");
assert.equal(clockRow.scheduledStart, "12:00", "approved override must become canonical scheduled start");
assert.equal(clockRow.staffName, "employeefx", "clock-in identity must remain server canonical");
assert.equal(clockRow.hourlyRate, 220, "clock-in wage rate must remain server canonical");

// Close the employee clock before testing the part-time leave date so later
// self-service regressions do not inherit an intentionally open shift.
const employeeAttendance = await readState(employee.cookie);
const employeeModule = structuredClone(employeeAttendance.modules.attendance);
const ownOpen = employeeModule.attendance.find((entry) => entry.id === overrideClockId);
ownOpen.clockOut = `${CHANGE_DATE}T17:00:00.000Z`;
const closeOverride = await request(`/api/business-state/${SITE}`, {
  method:"POST",
  cookie:employee.cookie,
  body:{ modules:{ attendance:employeeModule } },
});
assert.equal(closeOverride.response.status, 200, `override clock-out failed: ${JSON.stringify(closeOverride.data)}`);

const leaveClockId = "workforce-request-leave-clock";
const leaveClock = await clockIn(parttime.cookie, { id:leaveClockId, date:PARTTIME_LEAVE_DATE, staffId:PARTTIME_ID });
assert.equal(leaveClock.response.status, 200, `leave-date clock-in failed: ${JSON.stringify(leaveClock.data)}`);
adminState = await readState(admin.cookie);
clockRow = adminState.modules.attendance.attendance.find((entry) => entry.id === leaveClockId);
assert(clockRow, "leave-date clock-in row missing");
assert.equal(clockRow.scheduledStart, "", "approved leave must suppress base scheduled start without inventing payroll deductions");
assert.equal(clockRow.hourlyRate, 225, "part-time wage rate must remain server canonical");

console.log("WORKFORCE_REQUEST_API_REGRESSION_OK");