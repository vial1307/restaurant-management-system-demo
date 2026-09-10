import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  mergeSelfServiceAttendance,
  scopeWorkforceModules,
} from "../vps/backend/src/workforce-policy.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const api = fs.readFileSync(path.join(ROOT, "src/vps-api.js"), "utf8");
const sync = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const routes = fs.readFileSync(path.join(ROOT, "vps/backend/src/business-state-routes.mjs"), "utf8");
const saveFunction = api.match(/export async function vpsSaveBusinessState\([\s\S]*?\n}\n\nexport function vpsSchemaVersion/)?.[0] || "";

assert(saveFunction, "vpsSaveBusinessState must remain an explicit async confirmation boundary");
assert.match(saveFunction, /vpsSaveBusinessState\(site, modules, expectedModuleRevisions/, "business-state save must accept explicit per-module expected revisions");
assert.match(saveFunction, /const expected = normalizedModuleRevisions\(expectedModuleRevisions\)/, "transport must normalize only the revisions explicitly supplied by synchronization");
assert.match(saveFunction, /body:\s*\{\s*modules,\s*expectedModuleRevisions:\s*expected\s*\}/, "business-state POST must send resolved expectedModuleRevisions with dirty modules");
assert.match(saveFunction, /const result = await apiRequest\([\s\S]{0,320}\/api\/business-state\//, "business-state save must await the VPS response");
assert.match(saveFunction, /const confirmedRevisions = Array\.isArray\(result\?\.savedModules\)[\s\S]{0,260}moduleRevisions\[name\]/, "every saved module must carry a confirmed returned module revision");
assert.match(saveFunction, /BUSINESS_STATE_SAVE_CONFIRMATION_MISSING/, "missing module revision confirmation must fail explicitly");
assert.doesNotMatch(api, /businessModuleRevisionCache/, "transport must not own hidden business revision baseline state");
assert.match(saveFunction, /return \{ \.\.\.result, moduleRevisions \};/, "validated business-state save response must return normalized module revisions");

assert.match(sync, /let loadedModuleRevisionKey = "";[\s\S]{0,80}let loadedModuleRevisions = \{\};/, "business sync must own the accepted per-scope module revision baseline");
const acceptedRevisionHelper = sync.match(/const acceptedRevisionsFor = \(names, key = identityKey\(\)\) => \([\s\S]*?\n  \);/)?.[0] || "";
assert(acceptedRevisionHelper, "business sync must centralize accepted module revision lookup");
assert.match(acceptedRevisionHelper, /loadedModuleRevisionKey === key/, "accepted revision lookup must be scoped to the loaded identity");
assert.match(acceptedRevisionHelper, /Number\.isInteger\(loadedModuleRevisions\[name\]\)[\s\S]{0,100}loadedModuleRevisions\[name\]/, "accepted revision lookup must use only validated tokens from the sync baseline");
assert.match(sync, /const expectedModuleRevisions = acceptedRevisionsFor\(dirtyNames, key\)/, "dirty business writes must derive expected revisions from the accepted sync baseline helper");
assert.match(sync, /vpsSaveBusinessState\(site, dirtyModules, expectedModuleRevisions\)/, "business sync must pass its accepted revision baseline explicitly to transport");

const loadFunction = sync.match(/async function load\(\) \{[\s\S]*?\n  \}\n\n  const guardSiteSwitch/)?.[0] || "";
assert(loadFunction, "business sync load function must remain identifiable for concurrency contract guards");
const deferredMarkerIndex = loadFunction.indexOf('detail:{ status:"ready", site, deferred:true }');
const deferredReturnIndex = deferredMarkerIndex >= 0 ? loadFunction.indexOf("return;", deferredMarkerIndex) : -1;
const normalizeServerRevisionsIndex = loadFunction.indexOf("const serverModuleRevisions = normalizedModuleRevisions(result?.moduleRevisions);");
const adoptRevisionBaselineIndex = normalizeServerRevisionsIndex >= 0
  ? loadFunction.indexOf("loadedModuleRevisionKey = key;", normalizeServerRevisionsIndex)
  : -1;
assert(deferredMarkerIndex >= 0, "business sync must surface a deferred read when local state changes during GET");
assert(deferredReturnIndex > deferredMarkerIndex, "deferred business read must return from the load path");
assert(normalizeServerRevisionsIndex > deferredReturnIndex, "deferred read must return before normalizing a newer server revision baseline");
assert(adoptRevisionBaselineIndex > normalizeServerRevisionsIndex, "business sync must adopt module revision baseline only after an accepted read");

assert.match(routes, /scopeWorkforceModules\(user, permitted, modules \|\| \{\}\)/, "business-state reads must apply workforce record scoping after module authorization");
assert.match(routes, /isWorkforceSelfServiceUser\(user\)[\s\S]{0,120}attendance/, "employee/part-time attendance must enter the record-scoped self-service path");
assert.match(routes, /moduleName === "schedule" && isWorkforceSelfServiceUser\(user\)/, "employee/part-time schedule writes must be denied at the VPS boundary");

const employee = {
  id:"user-hai-dang",
  username:"haidang",
  display_name:"海登",
  role:"employee",
};
const baseModules = {
  shared:{
    staff:[
      { id:"staff-manager", name:"阿南", role:"manager", area:"noodles", hourlyRate:230 },
      { id:"staff-hai-dang", name:"海登", role:"employee", area:"soup", hourlyRate:220 },
    ],
  },
  attendance:{
    attendance:[
      { id:"manager-shift", date:"2026-09-11", staffId:"staff-manager", staffName:"阿南", area:"noodles", hourlyRate:230, scheduledStart:"10:30", clockIn:"2026-09-11T02:30:00.000Z", clockOut:"2026-09-11T13:30:00.000Z", breakMinutes:120, note:"" },
      { id:"employee-old", date:"2026-09-10", staffId:"staff-hai-dang", staffName:"海登", area:"soup", hourlyRate:220, scheduledStart:"17:00", clockIn:"2026-09-10T09:00:00.000Z", clockOut:"2026-09-10T16:00:00.000Z", breakMinutes:0, note:"" },
    ],
    payroll:{ latePenaltyEnabled:false, lateGraceMinutes:0, latePenaltyAmount:0, latePenaltyMode:"fixed", note:"" },
  },
  schedule:{
    schedules:[
      { id:"schedule-manager", date:"2026-09-11", staffId:"staff-manager", start:"10:30", end:"22:00" },
      { id:"schedule-hai-dang", date:"2026-09-11", staffId:"staff-hai-dang", start:"17:00", end:"00:00" },
    ],
  },
};

const scoped = scopeWorkforceModules(employee, structuredClone(baseModules), baseModules);
assert.deepEqual(scoped.attendance.attendance.map((entry) => entry.id), ["employee-old"], "employee read must contain only own attendance");
assert.deepEqual(scoped.schedule.schedules.map((entry) => entry.id), ["schedule-hai-dang"], "employee read must contain only own schedule");
assert.equal(scoped.shared.staff.find((entry) => entry.id === "staff-hai-dang")?.hourlyRate, 220, "employee may receive own hourly rate for own payroll calculation");
assert.equal(Object.hasOwn(scoped.shared.staff.find((entry) => entry.id === "staff-manager"), "hourlyRate"), false, "coworker hourly rate must not leak through shared staff");

const clockInInput = {
  attendance:[
    {
      id:"employee-new",
      date:"2026-09-11",
      staffId:"staff-hai-dang",
      staffName:"tampered",
      area:"meat",
      hourlyRate:9999,
      scheduledStart:"23:59",
      clockIn:"2026-09-11T09:01:00.000Z",
      clockOut:null,
      breakMinutes:999,
      note:"self clock in",
    },
    scoped.attendance.attendance[0],
  ],
  payroll:structuredClone(baseModules.attendance.payroll),
};
const clockInMerge = mergeSelfServiceAttendance(employee, baseModules, clockInInput);
assert.equal(clockInMerge.ok, true, "self clock-in must be accepted");
assert.equal(clockInMerge.module.attendance.length, 3, "self clock-in must preserve coworker attendance rows");
const canonicalNew = clockInMerge.module.attendance.find((entry) => entry.id === "employee-new");
assert.equal(canonicalNew.staffName, "海登", "server roster must canonicalize self-service staff name");
assert.equal(canonicalNew.area, "soup", "server roster must canonicalize self-service work area");
assert.equal(canonicalNew.hourlyRate, 220, "server roster must canonicalize self-service hourly rate");
assert.equal(canonicalNew.scheduledStart, "17:00", "server schedule must canonicalize scheduled start");
assert.equal(canonicalNew.breakMinutes, 0, "employee self-service must not set payroll-affecting break minutes");

const employeeViewAfterClockIn = {
  ...clockInMerge.module,
  attendance:clockInMerge.module.attendance.filter((entry) => entry.staffId === "staff-hai-dang"),
};
const clockOutInput = {
  ...employeeViewAfterClockIn,
  attendance:employeeViewAfterClockIn.attendance.map((entry) => entry.id === "employee-new"
    ? { ...entry, clockOut:"2026-09-11T16:00:00.000Z" }
    : entry),
};
const afterClockInModules = { ...baseModules, attendance:clockInMerge.module };
const clockOutMerge = mergeSelfServiceAttendance(employee, afterClockInModules, clockOutInput);
assert.equal(clockOutMerge.ok, true, "self clock-out may close the employee's existing open shift");
assert.equal(clockOutMerge.module.attendance.find((entry) => entry.id === "manager-shift")?.hourlyRate, 230, "self clock-out must preserve coworker rows exactly");

const crossStaff = mergeSelfServiceAttendance(employee, baseModules, {
  attendance:[baseModules.attendance.attendance[0]],
  payroll:baseModules.attendance.payroll,
});
assert.equal(crossStaff.ok, false, "employee must never submit coworker attendance rows");
assert.equal(crossStaff.error, "WORKFORCE_CROSS_STAFF_EDIT_NOT_ALLOWED");

const payrollEdit = mergeSelfServiceAttendance(employee, baseModules, {
  attendance:[baseModules.attendance.attendance[1]],
  payroll:{ ...baseModules.attendance.payroll, latePenaltyEnabled:true },
});
assert.equal(payrollEdit.ok, false, "employee must never edit payroll policy through attendance self-service");
assert.equal(payrollEdit.error, "WORKFORCE_PAYROLL_EDIT_NOT_ALLOWED");

const completedCorrection = mergeSelfServiceAttendance(employee, baseModules, {
  attendance:[{ ...baseModules.attendance.attendance[1], hourlyRate:500 }],
  payroll:baseModules.attendance.payroll,
});
assert.equal(completedCorrection.ok, false, "employee must not correct a completed attendance row");
assert.equal(completedCorrection.error, "WORKFORCE_ATTENDANCE_CORRECTION_NOT_ALLOWED");

console.log("VPS_BUSINESS_STATE_CONTRACT_OK");
