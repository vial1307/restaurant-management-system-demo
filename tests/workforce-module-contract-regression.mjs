import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workforce = read("src/workforce-module.js");
const reconciliation = read("src/workforce-reconciliation.js");
const approval = read("src/workforce-approval.js");
const workforceCss = read("src/workforce-module.css");
const accessCompat = read("src/workforce-access-compat.js");
const lockPolicy = read("vps/backend/src/workforce-lock-policy.mjs");
const approvalRoutes = read("vps/backend/src/workforce-approval-routes.mjs");
const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const index = read("index.html");
const vpsEntry = read("vps-entry.html");

assert.equal(index, vpsEntry, "canonical and VPS shells must remain identical");
assert(index.includes("src/workforce-module.css?v=__KITCHEN_RELEASE__"), "workforce CSS must be release stamped");
assert(index.includes("src/workforce-module.js?v=__KITCHEN_RELEASE__"), "workforce runtime must be release stamped");
assert(index.includes("src/workforce-access-compat.js?v=__KITCHEN_RELEASE__"), "workforce access compatibility must be release stamped");
assert(index.includes("src/workforce-reconciliation.js?v=__KITCHEN_RELEASE__"), "workforce reconciliation runtime must be release stamped");
assert(index.includes("src/workforce-approval.js?v=__KITCHEN_RELEASE__"), "workforce approval runtime must be release stamped");
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

assert.match(workforce, /const entries = \(state\?\.operations\?\.attendance \|\| \[\]\)\.filter\(\(entry\) => String\(entry\.date \|\| ""\)\.startsWith\(`\$\{currentMonth\}-`\)\);/, "legacy payroll renderer must remain scoped to the VPS-authorized attendance set");
assert.doesNotMatch(workforce, /ownId = state\?\.operations\?\.activeStaffId/, "payroll must not depend on stale device-local activeStaffId identity");
assert.doesNotMatch(workforce, /manager \|\| entry\.staffId === ownId/, "frontend must not re-authorize payroll rows using local staff identity");

assert.match(accessCompat, /attendanceView \|\| scheduleView/, "top-level workforce entry must be visible when either legacy view permission is available");
assert.match(accessCompat, /showTab\(tabs\.querySelector\('a\[href="#attendance"\]'\), attendanceView\)/, "attendance tab must honor attendance view permission");
assert.match(accessCompat, /showTab\(tabs\.querySelector\('a\[href="#schedule"\]'\), scheduleView\)/, "schedule tab must honor schedule view permission");
assert.match(accessCompat, /showTab\(tabs\.querySelector\('a\[href="#attendance\?workforce=payroll"\]'\), attendanceView\)/, "payroll tab must follow attendance permission");
assert.match(accessCompat, /route === "attendance" && !state\.attendanceView && state\.scheduleView/, "schedule-only legacy accounts must be redirected to their permitted panel");
assert.match(accessCompat, /dataset\.workforceLegacySchedule = "true"/, "authorized legacy schedule route must remain present without becoming a second visible navigation item");
assert.match(accessCompat, /isManagerOrAbove\(user\).*accountCan\(user, "attendance", "edit"\)/s, "attendance corrections must require manager/admin rank and attendance edit permission");
assert.match(accessCompat, /isManagerOrAbove\(user\).*accountCan\(user, "schedule", "edit"\)/s, "schedule management must require manager/admin rank and schedule edit permission");

assert.match(reconciliation, /import \{ calculateAttendance \} from "\.\/operations\.js"/, "reconciliation must reuse the canonical attendance calculator");
assert.match(reconciliation, /if \(!wage\.complete\).*kind:"open"/s, "open-shift status must derive from canonical completion state");
assert.match(reconciliation, /if \(wage\.lateMinutes > 0\).*kind:"late"/s, "late status must derive from canonical late minutes");
assert.match(reconciliation, /state\?\.operations\?\.attendance \|\| \[\]/, "monthly reconciliation must use the VPS-scoped attendance set");
assert.match(reconciliation, /function authoritativeScheduleModule/, "schedule reconciliation must resolve its authoritative schedule source explicitly");
assert.match(reconciliation, /remote\.module\.schedules/, "schedule reconciliation must prefer the VPS schedule module when request state is loaded");
assert.match(reconciliation, /state\?\.operations\?\.schedules/, "schedule reconciliation must retain the existing local schedule model as its pre-load fallback");
assert.match(reconciliation, /entry\.month === month && Number\(entry\.weekday\) === weekday/, "monthly recurring schedules must keep current month+weekday semantics");
assert.match(reconciliation, /plannedMinutes/, "schedule reconciliation must derive planned hours without converting them into payroll");
assert.doesNotMatch(reconciliation, /vpsSaveBusinessState|fetch\(|activeStaffId/, "reconciliation must remain read-only and must not authorize from local staff identity");
assert.match(reconciliation, /OT, hệ số ngày lễ, thưởng, bảo hiểm hoặc thuế/, "payroll estimate must disclose payroll rules that are intentionally not inferred");

assert.match(approval, /MANAGER_ROLES = new Set\(\["admin", "manager"\]\)/, "approval UI authority must be admin/manager only");
assert.match(approval, /entry\?\.approvalStatus === "approved"/, "approved attendance must be explicit server state");
assert.match(approval, /const approved = complete\.filter\(isApproved\)/, "payroll must aggregate approved completed shifts only");
assert.match(approval, /period\.policySnapshot/, "locked payroll must use the server-captured policy snapshot");
assert.match(approval, /legacyStats\.hidden = true/, "legacy all-attendance payroll totals must be hidden when approval payroll is active");
assert.match(approval, /legacyCard\.hidden = true/, "legacy all-attendance payroll table must be hidden when approval payroll is active");
assert.match(approval, /data-workforce-lock-period/, "manager payroll UI must expose period locking");
assert.match(approval, /data-workforce-reopen-form/, "locked payroll UI must expose reopen with reason");
assert.match(approval, /\/api\/workforce\/\$\{encodeURIComponent\(site\)\}\/attendance\//, "approval UI must use the dedicated VPS command route");
assert.doesNotMatch(approval, /activeStaffId/, "approval UI must not authorize from device-local staff identity");

assert.match(lockPolicy, /WORKFORCE_PAYROLL_PERIOD_DIRECT_EDIT_NOT_ALLOWED/, "generic business-state writes must not mutate payroll periods directly");
assert.match(lockPolicy, /WORKFORCE_ATTENDANCE_APPROVAL_DIRECT_EDIT_NOT_ALLOWED/, "generic business-state writes must not forge approval metadata");
assert.match(lockPolicy, /WORKFORCE_PAYROLL_PERIOD_LOCKED/, "generic attendance mutations must be blocked in locked periods");
assert.match(lockPolicy, /sanitized\.push\(clearApproval\(incoming\)\)/, "editing an approved open-period attendance row must invalidate approval");
assert.match(businessRoutes, /mergeManagedAttendance/, "business-state attendance writes must pass through managed workforce policy");
assert.match(businessRoutes, /enforceSelfServiceUnlocked/, "self-service writes must not alter locked payroll periods");
assert.match(businessRoutes, /workforceAttendanceChanges/, "attendance corrections must be identified in VPS audit metadata");

assert.match(approvalRoutes, /workforce-attendance-approve/, "VPS must audit attendance approval");
assert.match(approvalRoutes, /workforce-payroll-period-lock/, "VPS must audit payroll-period lock");
assert.match(approvalRoutes, /workforce-payroll-period-reopen/, "VPS must audit payroll-period reopen");
assert.match(approvalRoutes, /approvedByUserId/, "approval actor must be server generated");
assert.match(approvalRoutes, /lockedByUserId/, "payroll lock actor must be server generated");
assert.match(approvalRoutes, /policySnapshot/, "payroll lock must capture payroll policy");
assert.match(approvalRoutes, /WORKFORCE_PAYROLL_OPEN_SHIFTS/, "payroll lock must reject incomplete attendance");
assert.match(approvalRoutes, /WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS/, "payroll lock must reject unapproved completed attendance");
assert.match(approvalRoutes, /WORKFORCE_REOPEN_REASON_REQUIRED/, "reopening a locked payroll period must require a reason");

assert.match(workforceCss, /\.workforce-status\[data-kind="late"\]/, "late reconciliation status must have a dedicated visual state");
assert.match(workforceCss, /\.workforce-status\[data-kind="open"\]/, "open reconciliation status must have a dedicated visual state");
assert.match(workforceCss, /\.workforce-schedule-reconciliation/, "schedule reconciliation must have responsive styling");
assert.match(workforceCss, /\.workforce-approval-status/, "approval status must have dedicated styling");
assert.match(workforceCss, /\.workforce-period-reopen/, "payroll reopen control must be responsive");

assert.match(workforce, /出勤 · 排班 · 薪資/, "Traditional Chinese workforce label must be present");
assert.match(workforce, /Chấm công · Lịch làm · Lương/, "Vietnamese workforce label must be present");
assert.match(reconciliation, /排班對帳/, "Traditional Chinese reconciliation label must be present");
assert.match(reconciliation, /Đối soát ngoại lệ/, "Vietnamese reconciliation label must be present");
assert.match(approval, /已核准/, "Traditional Chinese approval label must be present");
assert.match(approval, /Đã duyệt/, "Vietnamese approval label must be present");

console.log("WORKFORCE_MODULE_CONTRACT_OK");