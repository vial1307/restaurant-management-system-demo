import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const index = read("index.html");
const vps = read("vps-entry.html");
const ui = read("src/workforce-schedule-rules.js");
const route = read("vps/backend/src/workforce-schedule-rule-routes.mjs");
const business = read("vps/backend/src/business-state-routes.mjs");
const policy = read("vps/backend/src/workforce-policy.mjs");
const spec = read("docs/spec-deltas/2026-09-13-workforce-schedule-rules.md");

assert.equal(index, vps, "desktop/static and VPS shells must stay byte-identical");
assert.match(index, /workforce-schedule-rules\.js\?v=__KITCHEN_RELEASE__/, "schedule rules UI missing from release shell");

for (const marker of [
  'morning:{ start:"10:00", end:"16:00" }',
  'evening:{ start:"16:00", end:"22:00" }',
  'full:{ start:"10:00", end:"22:00" }',
  '{ minTables:0, maxTables:3, requiredInside:2, fixedAreas:false, needsReview:true }',
  '{ minTables:4, maxTables:6, requiredInside:3, fixedAreas:false, needsReview:false }',
  '{ minTables:7, maxTables:12, requiredInside:4, fixedAreas:true, needsReview:false }',
  '{ minTables:13, maxTables:null, requiredInside:4, fixedAreas:true, needsReview:true }',
]) {
  assert(route.includes(marker), `backend legacy default missing: ${marker}`);
  assert(ui.includes(marker), `frontend legacy default missing: ${marker}`);
}

assert.match(route, /\["admin", "manager"\]\.includes\(String\(user\.role/, "rule API must be admin/manager only");
assert.match(route, /hasPermission\(user, "schedule", "edit"\)/, "rule API must require schedule edit permission");
assert.match(route, /WORKFORCE_SCHEDULE_MANAGER_REQUIRED/, "manager denial contract missing");
assert.match(route, /WORKFORCE_SCHEDULE_RULE_TIME_INVALID/, "time validation contract missing");
assert.match(route, /WORKFORCE_SCHEDULE_RULE_BANDS_INVALID/, "staffing band validation contract missing");
assert.match(route, /typeof band\.fixedAreas !== "boolean"/, "staffing booleans must be type-checked");
assert.match(route, /minTables !== priorMax \+ 1/, "staffing bands must be contiguous");
assert.match(route, /version:Math\.max\(0, Number\(previous\.version\) \|\| 0\) \+ 1/, "rule version must be server incremented");
assert.match(route, /workforce-schedule-rules-update/, "rule update audit missing");

assert.match(business, /next\.rules = structuredClone\(stored\.rules\)/, "generic schedule save must preserve server-owned rules");
assert.match(business, /registerWorkforceScheduleRuleRoutes\(app\)/, "schedule rule route must be registered");
assert.match(policy, /const \{ rules:_managerRules, \.\.\.scheduleForSelfService \} = modules\.schedule/, "self-service must not receive manager schedule rules");

assert.match(ui, /\["admin", "manager"\]\.includes\(role\)/, "UI rule editor must be manager/admin only");
assert.match(ui, /accountCan\(session, "schedule", "edit"\)/, "UI rule editor must require schedule edit permission");
assert.match(ui, /import \{ effectiveSchedulesForDate \} from "\.\/workforce-effective-schedule-core\.js";/, "capacity overlay must use the shared effective-schedule resolver");
assert.match(ui, /effectiveSchedulesForDate\(state\?\.operations \|\| \{\}, date, shift\)/, "capacity overlay must count approved leave/override effects instead of raw stored schedules");
assert.match(ui, /qualifiedAreas\(state\.operations, entry\.staffId\)/, "fixed-area coverage must retain SOP qualification check");
assert.match(ui, /newSchedulePending/, "new schedule default-time guard missing");
assert.match(ui, /cacheRules\.shifts\[shift\?\.value\]/, "new schedule defaults must use configured shift window");
assert.match(ui, /function setText\(node, value\)/, "schedule decorator must avoid identical text writes");
assert.match(ui, /function mutationNeedsDecoration\(mutation\)/, "schedule observer must filter unrelated DOM mutations");
assert.match(ui, /observer\.observe\(document\.querySelector\("#app"\) \|\| document\.body/, "schedule observer must stay scoped to the app root");
assert(!ui.includes("new MutationObserver(queueDecorate)"), "schedule observer must not decorate on every child-list mutation");
assert(!ui.includes("activeStaffId"), "rule UI must not trust device-local activeStaffId for authorization");

assert.match(spec, /Existing schedule assignments retain their stored `start` and `end`/, "immutable existing assignment requirement missing");
assert.match(spec, /No SQL\/schema migration/, "no-migration contract missing");
assert.match(spec, /does not make station taxonomy configurable/, "station taxonomy scope guard missing");

console.log("WORKFORCE_SCHEDULE_RULES_CONTRACT_OK");
