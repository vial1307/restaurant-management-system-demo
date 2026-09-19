import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const business = read("vps/backend/src/business-state-routes.mjs");
const requests = read("vps/backend/src/workforce-request-routes.mjs");
const publication = read("vps/backend/src/workforce-schedule-rule-routes.mjs");
const shadow = read("vps/backend/src/workforce-schedule-relational-shadow.mjs");
const relationalRead = read("vps/backend/src/workforce-schedule-relational-routes.mjs");

assert.match(business, /syncWorkforceScheduleDraftShadow\(client,/);
assert.match(business, /preserveScheduleWorkflow\(before\.schedule, effectiveEditable\.schedule\)/);
assert.ok(
  business.indexOf("syncWorkforceScheduleDraftShadow(client") < business.indexOf("update public.business_state"),
  "draft relational shadow must run before compatibility state commit"
);

assert.match(requests, /applyWorkforceScheduleWorkflowShadowMutation\(client,/);
assert.ok(
  requests.indexOf("applyWorkforceScheduleWorkflowShadowMutation(client") < requests.indexOf("update public.business_state"),
  "request relational shadow must run before compatibility state commit"
);

assert.match(publication, /insertWorkforceSchedulePublicationShadow\(client,/);
assert.ok(
  publication.indexOf("insertWorkforceSchedulePublicationShadow(client") < publication.lastIndexOf("update public.business_state"),
  "publication relational shadow must run before compatibility publication commit"
);

assert.match(shadow, /insert into public\.staff_members/);
assert.match(shadow, /staffRoster/);
assert.match(business, /staffRoster:Object\.hasOwn\(effectiveEditable, "shared"\)/);
assert.match(shadow, /set active=false/);
assert.match(shadow, /on conflict \(site_code,legacy_schedule_id\)/);
assert.match(shadow, /insert into public\.workforce_schedule_requests/);
assert.match(shadow, /insert into public\.workforce_schedule_exceptions/);
assert.match(shadow, /insert into public\.workforce_schedule_publications/);
assert.match(shadow, /insert into public\.workforce_schedule_publication_entries/);
assert.doesNotMatch(shadow, /delete from public\.workforce_schedule_publications/);

assert.match(relationalRead, /cutover:false/);
assert.match(relationalRead, /authority:state\.authority/);

console.log("WORKFORCE_SCHEDULE_RUNTIME_SHADOW_CONTRACT_OK");
