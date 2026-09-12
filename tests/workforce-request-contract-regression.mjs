import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const vpsEntry = read("vps-entry.html");
const ui = read("src/workforce-requests.js");
const css = read("src/workforce-requests.css");
const reconciliation = read("src/workforce-reconciliation.js");
const policy = read("vps/backend/src/workforce-policy.mjs");
const routes = read("vps/backend/src/workforce-request-routes.mjs");
const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const spec = read("docs/spec-deltas/2026-09-11-workforce-leave-shift-requests.md");

assert.equal(index, vpsEntry, "canonical and VPS shells must remain byte-identical");
assert(index.includes("src/workforce-requests.css?v=__KITCHEN_RELEASE__"), "workforce request CSS must be release stamped");
assert(index.includes("src/workforce-requests.js?v=__KITCHEN_RELEASE__"), "workforce request runtime must be release stamped");

assert.match(spec, /employee\/part-time may submit an own leave request or shift-change request/, "request authority must be specified before implementation");
assert.match(spec, /Generic schedule writes may edit `schedules` but must preserve/, "server-owned workflow boundary must be specified");
assert.match(spec, /Leave approval does not imply paid leave, unpaid leave, wage deduction/, "request workflow must not invent payroll rules");

assert.match(routes, /VALID_REQUEST_TYPES = new Set\(\["leave", "change"\]\)/, "VPS must restrict request types");
assert.match(routes, /isWorkforceSelfServiceUser/, "request creation must use workforce self-service identity rules");
assert.match(routes, /resolveWorkforceStaffId/, "request staff identity must be VPS resolved");
assert.match(routes, /WORKFORCE_SELF_SERVICE_REQUIRED/, "non-self-service accounts must not create own requests");
assert.match(routes, /WORKFORCE_SCHEDULE_MANAGER_REQUIRED/, "request decisions must require manager authority");
assert.match(routes, /\["admin", "manager"\]/, "supervisor must stay outside request decision authority");
assert.match(routes, /hasPermission\(user, "schedule", "edit"\)/, "manager request decisions must honor schedule edit permission");
assert.match(routes, /sourceSnapshot/, "shift-change request must capture source schedule snapshot");
assert.match(routes, /WORKFORCE_REQUEST_SCHEDULE_CHANGED/, "stale source schedules must fail closed");
assert.match(routes, /WORKFORCE_REQUEST_EXCEPTION_EXISTS/, "same-staff same-date exceptions must not stack");
assert.match(routes, /createdByUserId/, "request creator metadata must be server-owned");
assert.match(routes, /decidedByUserId/, "decision actor metadata must be server-owned");
assert.match(routes, /approvedByUserId/, "exception approval actor metadata must be server-owned");
assert.match(routes, /workforce-schedule-request-create/, "request creation must be audited");
assert.match(routes, /workforce-schedule-request-cancel/, "request cancellation must be audited");
assert.match(routes, /workforce-schedule-request-approve/, "request approval must be audited");
assert.match(routes, /workforce-schedule-request-reject/, "request rejection must be audited");

assert.match(businessRoutes, /registerWorkforceRequestRoutes/, "business route registration must include request commands");
assert.match(businessRoutes, /function preserveScheduleWorkflow/, "generic schedule writes must have an explicit server-owned workflow guard");
assert.match(businessRoutes, /next\.requests = structuredClone/, "generic writes must preserve request records");
assert.match(businessRoutes, /next\.exceptions = structuredClone/, "generic writes must preserve approved exceptions");

assert.match(policy, /requests: Array\.isArray\(modules\.schedule\.requests\)/, "self-service schedule reads must scope request rows");
assert.match(policy, /exceptions: Array\.isArray\(modules\.schedule\.exceptions\)/, "self-service schedule reads must scope exception rows");
assert.match(policy, /export function scheduledStartFor/, "attendance canonicalization must expose effective scheduled-start resolution");
assert.match(policy, /activeExceptions/, "scheduled-start resolution must inspect approved exceptions first");
assert.match(policy, /kind === "override" \? text\(activeExceptions\[0\]\.start\) : ""/, "leave must suppress scheduled start and override must replace it");

assert.match(reconciliation, /__shituWorkforceScheduleModule/, "schedule reconciliation must consume VPS request state");
assert.match(reconciliation, /function effectiveSchedules/, "schedule reconciliation must resolve approved exceptions");
assert.match(reconciliation, /exception\.kind === "leave"/, "approved leave must remove the planned shift from effective schedule");
assert.match(reconciliation, /exception\.kind !== "override"/, "only approved override exceptions may replace planned times");
assert.match(reconciliation, /plannedMinutes/, "effective schedule remains planning data rather than payroll math");

assert.match(ui, /SELF_SERVICE_ROLES = new Set\(\["employee", "parttime"\]\)/, "employee and part-time must get request self-service");
assert.match(ui, /MANAGER_ROLES = new Set\(\["admin", "manager"\]\)/, "only admin/manager may get decision UI");
assert.match(ui, /data-workforce-request-form/, "self-service request form missing");
assert.match(ui, /data-workforce-request-approve/, "manager approve control missing");
assert.match(ui, /data-workforce-request-reject-form/, "manager reject control missing");
assert.match(ui, /data-workforce-request-cancel/, "owner pending-request cancel control missing");
assert.match(ui, /\/api\/workforce\/\$\{encodeURIComponent\(activeSite\(\)\)\}\/schedule-requests/, "UI must use dedicated VPS request commands");
assert.match(ui, /payrollBoundary/, "UI must disclose payroll boundary");
assert.match(ui, /Yêu cầu lịch làm/, "Vietnamese request UI copy missing");
assert.match(ui, /排班申請/, "Traditional Chinese request UI copy missing");
assert.doesNotMatch(ui, /activeStaffId/, "request authorization must not trust device-local activeStaffId");

assert.match(css, /\.workforce-request-workspace/, "request workspace styling missing");
assert.match(css, /@media \(max-width:/, "request workspace must include mobile responsive rules");

console.log("WORKFORCE_REQUEST_CONTRACT_OK");