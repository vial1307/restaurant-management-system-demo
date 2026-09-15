import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  scheduledStartFor,
  scopeWorkforceModules,
} from "../vps/backend/src/workforce-policy.mjs";

const employee = {
  id:"user-a",
  username:"employee-a",
  display_name:"Employee A",
  role:"employee",
  capabilities:{"workforce.self_service":true},
};

const staff = [
  { id:"staff-a", name:"Employee A", accountUserId:"user-a", hourlyRate:220 },
  { id:"staff-b", name:"Employee B", accountUserId:"user-b", hourlyRate:230 },
];

const draftA = {
  id:"draft-a",
  date:"2026-09-16",
  month:"2026-09",
  weekday:3,
  applyMode:"day",
  staffId:"staff-a",
  staffName:"Employee A",
  department:"inside",
  area:"noodles",
  shift:"evening",
  start:"17:00",
  end:"22:00",
};
const draftB = { ...draftA, id:"draft-b", staffId:"staff-b", staffName:"Employee B", start:"16:00" };
const publishedA = { ...draftA, id:"published-a", start:"15:30" };
const publishedB = { ...draftB, id:"published-b", start:"15:00" };

const compatibilityModules = {
  shared:{ staff },
  schedule:{ schedules:[draftA, draftB], requests:[], exceptions:[] },
};
const compatibilityScoped = scopeWorkforceModules(employee, compatibilityModules, compatibilityModules);
assert.deepEqual(
  compatibilityScoped.schedule.schedules.map((entry) => entry.id),
  ["draft-a"],
  "Before first publication, employee must keep seeing their existing draft schedule as rollout compatibility"
);
assert.equal(scheduledStartFor(compatibilityModules, "staff-a", "2026-09-16"), "17:00");

const publishedModules = {
  shared:{ staff },
  schedule:{
    schedules:[draftA, draftB],
    publishedSchedules:[publishedA, publishedB],
    publication:{
      version:1,
      publishedAt:"2026-09-15T10:00:00.000Z",
      publishedByUserId:"manager-1",
      publishedByName:"Manager",
      scheduleCount:2,
      sourceModuleRevision:7,
    },
    requests:[],
    exceptions:[],
  },
};
const publishedScoped = scopeWorkforceModules(employee, publishedModules, publishedModules);
assert.deepEqual(
  publishedScoped.schedule.schedules.map((entry) => [entry.id, entry.start]),
  [["published-a", "15:30"]],
  "After publication, employee must receive only their own published schedule"
);
assert.equal(
  Object.hasOwn(publishedScoped.schedule, "publishedSchedules"),
  false,
  "Employee payload must not expose the branch-wide published schedule snapshot"
);
assert.equal(publishedScoped.schedule.publication.version, 1, "Safe publication metadata should remain visible to employee");
assert.equal(scheduledStartFor(publishedModules, "staff-a", "2026-09-16"), "15:30", "Clock-in scheduled start must use published schedule");

const overridden = structuredClone(publishedModules);
overridden.schedule.exceptions = [{
  id:"override-a",
  staffId:"staff-a",
  date:"2026-09-16",
  kind:"override",
  start:"18:00",
  end:"23:00",
}];
assert.equal(scheduledStartFor(overridden, "staff-a", "2026-09-16"), "18:00", "Approved override remains authoritative after publication");

const onLeave = structuredClone(publishedModules);
onLeave.schedule.exceptions = [{ id:"leave-a", staffId:"staff-a", date:"2026-09-16", kind:"leave" }];
assert.equal(scheduledStartFor(onLeave, "staff-a", "2026-09-16"), "", "Approved leave removes canonical scheduled start");

const emptyPublished = structuredClone(publishedModules);
emptyPublished.schedule.publishedSchedules = [];
assert.equal(scheduledStartFor(emptyPublished, "staff-a", "2026-09-16"), "", "Once published, an empty snapshot must fail closed instead of falling back to draft");

const [businessRoutes, scheduleRoutes, publicationUi, indexHtml, vpsEntry] = await Promise.all([
  readFile(new URL("../vps/backend/src/business-state-routes.mjs", import.meta.url), "utf8"),
  readFile(new URL("../vps/backend/src/workforce-schedule-rule-routes.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/workforce-schedule-publication.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../vps-entry.html", import.meta.url), "utf8"),
]);

assert.match(businessRoutes, /next\.publishedSchedules\s*=\s*structuredClone\(stored\.publishedSchedules\)/, "Generic schedule save must preserve publishedSchedules");
assert.match(businessRoutes, /next\.publication\s*=\s*structuredClone\(stored\.publication\)/, "Generic schedule save must preserve publication metadata");
assert.match(scheduleRoutes, /\/api\/workforce\/:site\/schedule-publish/, "Schedule publish endpoint is missing");
assert.match(scheduleRoutes, /WORKFORCE_SCHEDULE_PUBLISH_REVISION_REQUIRED/, "Publish endpoint must require an expected schedule revision");
assert.match(scheduleRoutes, /moduleRevision\s*!==\s*expectedModuleRevision/, "Publish endpoint must compare the reviewed revision under the row lock");
assert.match(scheduleRoutes, /WORKFORCE_SCHEDULE_PUBLISH_CONFLICT/, "Publish endpoint must expose a deterministic revision conflict");
assert.match(scheduleRoutes, /workforce-schedule-publish/, "Schedule publish audit action is missing");
assert.match(scheduleRoutes, /publishedSchedules\s*=\s*draftSchedules/, "Publish endpoint must snapshot the current server draft");
assert.match(publicationUi, /expectedModuleRevision:latest\.moduleRevision/, "Publication UI must publish the exact revision it reviewed");
assert.match(publicationUi, /shitu:workforce-schedule-state/, "Publication UI must refresh the canonical business-state revision after publish");
assert.match(indexHtml, /workforce-schedule-publication\.js/, "Canonical index does not load schedule publication UI");
assert.match(vpsEntry, /workforce-schedule-publication\.js/, "VPS entry does not load schedule publication UI");

console.log("WORKFORCE_SCHEDULE_PUBLICATION_REGRESSION_OK");
