import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessShiftCapacity, hydrateOperations } from "../src/operations.js";
import { effectiveSchedulesForDate, normalizeScheduleException } from "../src/workforce-effective-schedule-core.js";
import { businessModulesFromState } from "../src/business-state-sync.js";

const DATE = "2039-01-05";
const areas = ["noodles", "soup", "seafood", "meat"];
const schedules = areas.map((area, index) => ({
  id:`schedule-${index + 1}`,
  date:DATE,
  month:"2039-01",
  weekday:3,
  applyMode:"day",
  staffId:`staff-${index + 1}`,
  staffName:`Staff ${index + 1}`,
  department:"inside",
  area,
  shift:"evening",
  start:"16:00",
  end:"22:00",
  note:"",
}));

const sops = areas.map((area) => ({
  id:`sop-${area}`,
  area,
  label:area,
  labelVi:area,
  revision:1,
  status:"published",
  pending:null,
  updatedAt:null,
  updatedBy:null,
  versions:[],
  cookSeconds:0,
  dineContainer:"",
  takeawayContainer:"",
  dineNote:"",
  takeawayNote:"",
  plating:"",
  utensils:[],
  steps:[],
  photos:[],
}));
const learning = areas.map((area, index) => ({ staffId:`staff-${index + 1}`, sopId:`sop-${area}`, revision:1 }));

function operations(exceptions = [], extraSchedules = []) {
  return hydrateOperations({
    staff:[
      { id:"staff-manager", name:"Manager", role:"manager", area:"noodles", active:true, hourlyRate:230 },
      ...areas.map((area, index) => ({ id:`staff-${index + 1}`, name:`Staff ${index + 1}`, role:"employee", area, active:true, hourlyRate:220 })),
    ],
    activeStaffId:"staff-manager",
    schedules:[...schedules, ...extraSchedules],
    scheduleExceptions:exceptions,
    sops,
    learning,
  }, {});
}

function state(exceptions = [], extraSchedules = []) {
  return {
    records:{ [DATE]:{ reservation:{ dinnerTables:7 } } },
    operations:operations(exceptions, extraSchedules),
  };
}

const baseline = assessShiftCapacity(state(), DATE, "evening");
assert.equal(baseline.inside.length, 4, "baseline should count four unique effective inside schedules");
assert.equal(baseline.overloaded, false, "four qualified areas should satisfy 7-table capacity");

const leave = {
  id:"exception-leave",
  requestId:"request-leave",
  staffId:"staff-1",
  staffName:"Staff 1",
  date:DATE,
  kind:"leave",
  sourceScheduleId:"schedule-1",
};
const leaveCapacity = assessShiftCapacity(state([leave]), DATE, "evening");
assert.equal(leaveCapacity.inside.length, 3, "approved leave must remove the base shift from effective capacity");
assert.equal(leaveCapacity.overloaded, true, "approved leave must surface the resulting staffing shortage");

const override = {
  id:"exception-override",
  requestId:"request-override",
  staffId:"staff-1",
  staffName:"Staff 1",
  date:DATE,
  kind:"override",
  sourceScheduleId:"schedule-1",
  start:"17:00",
  end:"23:00",
  department:"inside",
  area:"noodles",
  shift:"evening",
};
const effectiveOverride = effectiveSchedulesForDate(operations([override]), DATE, "evening");
assert.equal(effectiveOverride.length, 4, "valid override should retain one effective shift");
assert.equal(effectiveOverride.find((entry) => entry.staffId === "staff-1")?.start, "17:00", "override start must replace base start");
assert.equal(effectiveOverride.find((entry) => entry.staffId === "staff-1")?.end, "23:00", "override end must replace base end");
assert.equal(assessShiftCapacity(state([override]), DATE, "evening").overloaded, false, "valid override should preserve capacity");

const staleOverride = { ...override, sourceScheduleId:"old-schedule" };
assert.equal(effectiveSchedulesForDate(operations([staleOverride]), DATE, "evening").length, 3, "stale override must fail closed instead of counting a changed base shift");

const malformedOverride = { ...override, start:"25:00" };
assert.equal(normalizeScheduleException(malformedOverride), null, "malformed override should be rejected by normalization");
assert.equal(effectiveSchedulesForDate(operations([malformedOverride]), DATE, "evening").length, 3, "malformed exception on a staffed date must fail closed");

const duplicateExceptions = [leave, { ...leave, id:"exception-leave-2", requestId:"request-leave-2" }];
assert.equal(effectiveSchedulesForDate(operations(duplicateExceptions), DATE, "evening").length, 3, "duplicate exceptions for one staff/date must fail closed");

const recurringForStaff1 = {
  ...schedules[0],
  id:"schedule-recurring-1",
  applyMode:"month",
  date:"2039-01-01",
  month:"2039-01",
  weekday:new Date(`${DATE}T12:00:00Z`).getUTCDay(),
};
const dayWins = effectiveSchedulesForDate(operations([], [recurringForStaff1]), DATE, "evening");
assert.equal(dayWins.filter((entry) => entry.staffId === "staff-1").length, 1, "specific-day schedule must take precedence over recurring schedule");
assert.equal(dayWins.find((entry) => entry.staffId === "staff-1")?.id, "schedule-1", "day-specific schedule should be the effective base");

const duplicateDay = { ...schedules[0], id:"schedule-duplicate-day" };
assert.equal(effectiveSchedulesForDate(operations([], [duplicateDay]), DATE, "evening").filter((entry) => entry.staffId === "staff-1").length, 0, "ambiguous duplicate base schedules must fail closed");

const hydrated = operations([override]);
assert.equal(hydrated.scheduleExceptions.length, 1, "VPS exceptions should survive operations hydration");
assert.equal(hydrated.scheduleExceptions[0].id, "exception-override");

const outbound = businessModulesFromState({ settings:{}, records:{}, operations:hydrated });
assert.deepEqual(Object.keys(outbound.schedule).sort(), ["schedules"], "generic business save must not serialize server-owned schedule exceptions");
assert.equal(Object.hasOwn(outbound.schedule, "exceptions"), false, "generic save must not be able to forge/delete schedule exceptions");

const syncSource = readFileSync(new URL("../src/business-state-sync.js", import.meta.url), "utf8");
assert.match(syncSource, /state\.operations\.scheduleExceptions\s*=\s*Array\.isArray\(schedule\.exceptions\)/, "business sync must hydrate authoritative VPS exceptions into runtime state");
assert.match(syncSource, /addEventListener\("shitu:workforce-schedule-state", reload\)/, "request updates must force a fresh authoritative schedule revision load");
assert.match(syncSource, /removeEventListener\("shitu:workforce-schedule-state", reload\)/, "schedule-state reload listener must be cleaned up");

console.log("workforce effective schedule regression: ok");
