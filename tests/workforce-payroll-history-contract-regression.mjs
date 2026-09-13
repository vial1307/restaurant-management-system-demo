import assert from "node:assert/strict";
import fs from "node:fs";

const snapshot = fs.readFileSync("vps/backend/src/workforce-payroll-snapshot.mjs", "utf8");
const routes = fs.readFileSync("vps/backend/src/workforce-approval-routes.mjs", "utf8");
const lockPolicy = fs.readFileSync("vps/backend/src/workforce-lock-policy.mjs", "utf8");
const workforcePolicy = fs.readFileSync("vps/backend/src/workforce-policy.mjs", "utf8");
const ui = fs.readFileSync("src/workforce-payroll-history.js", "utf8");
const css = fs.readFileSync("src/workforce-payroll-history.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const vps = fs.readFileSync("vps-entry.html", "utf8");
const spec = fs.readFileSync("docs/spec-deltas/2026-09-13-workforce-payroll-history-export.md", "utf8");

assert.equal(index, vps, "canonical and VPS shells must remain byte-identical");
assert.match(index, /workforce-payroll-history\.css\?v=__KITCHEN_RELEASE__/);
assert.match(index, /workforce-payroll-history\.js\?v=__KITCHEN_RELEASE__/);

assert.match(routes, /buildPayrollLockSnapshot/);
assert.match(routes, /history:\[\.\.\.priorHistory,\s*snapshot\]/);
assert.match(routes, /currentRevision:snapshot\.revision/);
assert.match(routes, /currentPeriod\?\.status === "locked"/);
assert.match(routes, /unchanged:true/);
assert.match(routes, /WORKFORCE_MANAGER_REQUIRED/);
assert.match(routes, /sourceReopen|reopenReason/);

assert.match(snapshot, /formulaVersion:1/);
assert.match(snapshot, /currency:"TWD"/);
assert.match(snapshot, /approvedAttendanceIds/);
assert.match(snapshot, /attendanceRows/);
assert.match(snapshot, /staffRows/);
assert.match(snapshot, /workedMinutes/);
assert.match(snapshot, /Math\.round\(totalMinutes \/ 60 \* hourlyRate\)/);
assert.match(snapshot, /latePenaltyMode === "per-minute"/);
assert.doesNotMatch(snapshot, /overtime|holiday|insurance|tax/i, "snapshot core must not invent wage rules");

assert.match(lockPolicy, /WORKFORCE_PAYROLL_PERIOD_DIRECT_EDIT_NOT_ALLOWED/);
assert.match(lockPolicy, /periods:structuredClone\(beforePeriods\)/);
assert.match(workforcePolicy, /selfServicePayroll/);
assert.doesNotMatch(
  workforcePolicy.match(/function selfServicePayroll[\s\S]*?return scoped;\n}/)?.[0] || "",
  /history|currentRevision|lockedByName|staffRows|attendanceRows/,
  "self-service payroll scope must not expose history details"
);

assert.match(ui, /MANAGER_ROLES/);
assert.match(ui, /accountCan\(session, "attendance", "edit"\)/);
assert.match(ui, /data-payroll-history-export/);
assert.match(ui, /new Blob/);
assert.match(ui, /\\uFEFF/);
assert.match(ui, /payroll-\$\{site\}-\$\{month\}-r\$\{revision\}\.csv/);
assert.match(ui, /snapshot\.attendanceRows/);
assert.match(ui, /payroll-history-legacy/);
assert.match(ui, /Lịch sử kỳ lương/);
assert.match(ui, /薪資歷史/);
assert.match(css, /@media\(max-width:840px\)/);
assert.match(css, /@media\(max-width:520px\)/);

assert.match(spec, /immutable revision snapshot/i);
assert.match(spec, /No new wage rules/i);
assert.match(spec, /UTF-8 BOM CSV/i);

console.log("WORKFORCE_PAYROLL_HISTORY_CONTRACT_REGRESSION_OK");
