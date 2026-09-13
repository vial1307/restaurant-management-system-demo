import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const vpsEntry = read("vps-entry.html");
const ui = read("src/workforce-corrections.js");
const css = read("src/workforce-corrections.css");
const policy = read("vps/backend/src/workforce-policy.mjs");
const lockPolicy = read("vps/backend/src/workforce-lock-policy.mjs");
const routes = read("vps/backend/src/workforce-correction-routes.mjs");
const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const spec = read("docs/spec-deltas/2026-09-13-workforce-attendance-corrections.md");

assert.equal(index, vpsEntry, "canonical and VPS shells must remain byte-identical");
assert(index.includes("src/workforce-corrections.css?v=__KITCHEN_RELEASE__"), "correction CSS must be release stamped");
assert(index.includes("src/workforce-corrections.js?v=__KITCHEN_RELEASE__"), "correction runtime must be release stamped");

assert.match(spec, /employee and part-time accounts may request a correction only for one of their own attendance rows/, "self-service authority must be specified before implementation");
assert.match(spec, /clears its approval metadata so the row must be reviewed again/, "approval invalidation must be specified");
assert.match(spec, /locked payroll month cannot be approved until an authorized manager explicitly reopens/, "payroll lock boundary must be specified");
assert.match(spec, /Generic business-state protection/, "generic-write protection must be specified");
assert.match(spec, /does not invent wage rules|without weakening the existing payroll-period lock or inventing wage rules/, "correction flow must not invent wage rules");

assert.match(routes, /isWorkforceSelfServiceUser/, "correction creation must use workforce self-service roles");
assert.match(routes, /resolveWorkforceStaffId/, "correction staff identity must be VPS resolved");
assert.match(routes, /hasPermission\(user, "attendance", "edit"\)/, "manager correction decisions must require attendance edit permission");
assert.match(routes, /\["admin", "manager"\]/, "supervisor must stay outside correction decision authority");
assert.match(routes, /sourceSnapshot/, "correction must capture the source attendance facts");
assert.match(routes, /WORKFORCE_CORRECTION_SOURCE_CHANGED/, "stale attendance must fail closed");
assert.match(routes, /WORKFORCE_PAYROLL_PERIOD_LOCKED/, "locked payroll period must block correction approval");
assert.match(routes, /clearApproval\(entry\)/, "approved correction must invalidate attendance approval");
assert.match(routes, /delete entry\.approvalStatus/, "approval status must be server-cleared after correction");
assert.match(routes, /WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED/, "rejection must require a reason");
assert.match(routes, /workforce-attendance-correction-create/, "correction creation must be audited");
assert.match(routes, /workforce-attendance-correction-cancel/, "correction cancellation must be audited");
assert.match(routes, /workforce-attendance-correction-approve/, "correction approval must be audited");
assert.match(routes, /workforce-attendance-correction-reject/, "correction rejection must be audited");
assert.match(routes, /module_revisions/, "correction commands must update module revision state");

assert.match(businessRoutes, /registerWorkforceCorrectionRoutes/, "business routes must register correction commands");
assert.match(lockPolicy, /correctionRequests:structuredClone\(beforeModule\.correctionRequests\)/, "generic attendance writes must preserve server-owned correction requests");
assert.match(policy, /correctionRequests: Array\.isArray\(modules\.attendance\.correctionRequests\)/, "self-service reads must scope correction requests");
assert.match(policy, /String\(entry\?\.staffId \|\| ""\) === staffId/, "correction request reads must be scoped to canonical staff identity");

assert.match(ui, /SELF_SERVICE_ROLES = new Set\(\["employee", "parttime"\]\)/, "employee and part-time must get correction self-service");
assert.match(ui, /MANAGER_ROLES = new Set\(\["admin", "manager"\]\)/, "only admin/manager may get correction decision UI");
assert.match(ui, /data-workforce-correction-form/, "self-service correction form missing");
assert.match(ui, /data-workforce-correction-approve/, "manager correction approve control missing");
assert.match(ui, /data-workforce-correction-reject-form/, "manager correction reject control missing");
assert.match(ui, /data-workforce-correction-cancel/, "owner correction cancel control missing");
assert.match(ui, /attendance-corrections/, "UI must call dedicated VPS correction commands");
assert.match(ui, /WORKFORCE_PAYROLL_PERIOD_LOCKED/, "UI must surface locked-period correction denial");
assert.match(ui, /removeAttribute\("data-signature"\)/, "failed writes must re-enable correction controls by forcing a safe rerender");
assert.match(ui, /Yêu cầu sửa chấm công/, "Vietnamese correction UI copy missing");
assert.match(ui, /出勤修正申請/, "Traditional Chinese correction UI copy missing");
assert.doesNotMatch(ui, /activeStaffId/, "correction authorization must not trust device-local activeStaffId");

assert.match(css, /\.workforce-correction-workspace/, "correction workspace styling missing");
assert.match(css, /@media\(max-width:840px\)/, "correction workspace must include mobile responsive rules");

console.log("WORKFORCE_CORRECTION_CONTRACT_OK");
