import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workforce = read("src/workforce-module.js");
const index = read("index.html");
const vpsEntry = read("vps-entry.html");

assert.equal(index, vpsEntry, "canonical and VPS shells must remain identical");
assert(index.includes("src/workforce-module.css?v=__KITCHEN_RELEASE__"), "workforce CSS must be release stamped");
assert(index.includes("src/workforce-module.js?v=__KITCHEN_RELEASE__"), "workforce runtime must be release stamped");
assert(!index.includes("src/all-button-feedback.js"), "generic UI-button feedback must stay removed");

assert.match(workforce, /data-workforce-tabs/, "merged module must render internal tabs");
assert.match(workforce, /href="#attendance"/, "attendance tab must stay available");
assert.match(workforce, /href="#schedule"/, "legacy schedule route must remain an internal compatible tab");
assert.match(workforce, /workforce=payroll/, "salary must be an explicit internal tab");
assert.match(workforce, /calculateAttendance/, "salary view must use the canonical wage calculator");
assert.match(workforce, /WORKFORCE_ROLES = new Set\(\["admin", "manager"\]\)/, "time correction authority must be manager and above");
assert.match(workforce, /accountCan\(session, "attendance", "edit"\)/, "manager time correction must still honor account permission");
assert.match(workforce, /name="clockIn"/, "manager time editor must edit actual clock-in");
assert.match(workforce, /name="clockOut"/, "manager time editor must edit actual clock-out");
assert.match(workforce, /name="breakMinutes"/, "manager time editor must edit break time");
assert.match(workforce, /name="hourlyRate"/, "manager time editor must edit hourly rate used for payroll");
assert.match(workforce, /vpsSaveBusinessState\(site, \{ attendance:module \}, \{ attendance:expected \}\)/, "time corrections must be confirmed by VPS with module revision guard");
assert.match(workforce, /invalidRange/, "time editor must reject clock-out before clock-in");
assert.match(workforce, /data-action="schedule-add"/, "non-manager schedule-management controls must be role guarded");
assert.match(workforce, /data-action="attendance-edit"/, "non-manager attendance correction controls must be role guarded");

assert.match(workforce, /data-permission-module="attendance"/, "existing attendance permission row must become the merged visible workforce row");
assert.match(workforce, /data-permission-module="schedule"/, "legacy schedule permission must remain available for compatibility");
assert.match(workforce, /scheduleRow\.hidden = true/, "Settings must show only one merged workforce permission row");
assert.match(workforce, /scheduleView\.checked = attendanceView\.checked/, "merged permission view toggle must synchronize both legacy permission keys");
assert.match(workforce, /scheduleEdit\.checked = managerRole && attendanceEdit\.checked/, "schedule edit permission must only mirror for manager/admin accounts");
assert.match(workforce, /出勤 · 排班 · 薪資/, "Traditional Chinese workforce label must be present");
assert.match(workforce, /Chấm công · Lịch làm · Lương/, "Vietnamese workforce label must be present");

console.log("WORKFORCE_MODULE_CONTRACT_OK");
