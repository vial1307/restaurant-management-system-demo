import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const route = fs.readFileSync(
  path.join(ROOT, "vps/backend/src/workforce-schedule-relational-routes.mjs"),
  "utf8"
);
const projection = fs.readFileSync(
  path.join(ROOT, "vps/backend/src/workforce-schedule-relational-state.mjs"),
  "utf8"
);

assert.match(route, /requireUser\(/, "relational schedule state must require authentication");
assert.match(route, /siteAllowed\(user, site\)/, "relational schedule state must enforce site scope");
assert.match(route, /hasPermission\(user, "schedule", "view"\)/, "relational schedule state must enforce schedule view permission");
assert.match(route, /scopeWorkforceModules\(/, "relational schedule state must preserve workforce self-service scoping");
assert.match(route, /workforceScheduleRelationalReadEnabled\(\)/, "relational schedule state must report the server-side read cutover gate");
assert.match(route, /authority:cutover \? "relational-primary" : state\.authority/, "route must expose relational-primary only when the cutover gate is enabled");
assert.match(route, /cutover,/, "route must expose the active cutover boolean");
assert.doesNotMatch(route, /app\.(post|put|patch|delete)\(/, "shadow schedule route must remain read-only");
assert.match(projection, /workforce_schedule_entries/, "projection must read relational draft schedule rows");
assert.match(projection, /workforce_schedule_publications/, "projection must read relational publication history");
assert.match(projection, /workforce_schedule_requests/, "projection must read relational requests");
assert.match(projection, /workforce_schedule_exceptions/, "projection must read relational exceptions");
assert.match(projection, /legacy_staff_id/, "projection must preserve legacy frontend staff identity during compatibility phase");
assert.match(projection, /legacy_schedule_id/, "projection must preserve legacy schedule identity during compatibility phase");

console.log("WORKFORCE_SCHEDULE_RELATIONAL_ROUTE_CONTRACT_OK");
