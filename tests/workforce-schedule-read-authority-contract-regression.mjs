import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  workforceScheduleRelationalReadEnabled,
  resolveWorkforceScheduleReadAuthority,
} from "../vps/backend/src/workforce-schedule-read-authority.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const businessRoutes = read("vps/backend/src/business-state-routes.mjs");
const relationalRoutes = read("vps/backend/src/workforce-schedule-relational-routes.mjs");
const compose = read("vps/docker-compose.yml");

assert.equal(workforceScheduleRelationalReadEnabled({}), false);
assert.equal(workforceScheduleRelationalReadEnabled({ WORKFORCE_SCHEDULE_RELATIONAL_READ:"false" }), false);
assert.equal(workforceScheduleRelationalReadEnabled({ WORKFORCE_SCHEDULE_RELATIONAL_READ:"true" }), true);
assert.equal(workforceScheduleRelationalReadEnabled({ WORKFORCE_SCHEDULE_RELATIONAL_READ:"1" }), true);

let queried = false;
const disabled = await resolveWorkforceScheduleReadAuthority(
  { query:async () => { queried = true; throw new Error("disabled gate queried database"); } },
  {
    site:"fuxing",
    modules:{ schedule:{ schedules:[{ id:"compat-only" }] }, settings:{ reservationBuffer:2 } },
    enabled:false,
  }
);
assert.equal(queried, false, "disabled read gate must not touch relational schedule tables");
assert.equal(disabled.authority, "compatibility-json");
assert.equal(disabled.cutover, false);
assert.equal(disabled.modules.schedule.schedules[0].id, "compat-only");

assert.match(
  businessRoutes,
  /resolveWorkforceScheduleReadAuthority\(pool, \{ site, modules:storedModules \}\)/,
  "business-state GET must resolve schedule read authority through one gated helper"
);
assert.match(
  businessRoutes,
  /filteredModuleRevisions\(user, storedModules, row\?\.module_revisions \|\| \{\}\)/,
  "cutover reads must keep compatibility module revision tokens for rollback-safe writes"
);
assert.match(
  businessRoutes,
  /readAuthorities:[\s\S]{0,120}schedule:scheduleRead\.authority/,
  "business-state response must expose the active schedule read source"
);
assert.match(
  relationalRoutes,
  /workforceScheduleRelationalReadEnabled\(\)/,
  "relational diagnostic route must report the same server-side cutover flag"
);
assert.match(
  relationalRoutes,
  /authority:cutover \? "relational-primary" : state\.authority/,
  "diagnostic metadata must not claim relational-primary while the gate is off"
);
assert.match(
  compose,
  /WORKFORCE_SCHEDULE_RELATIONAL_READ: \$\{WORKFORCE_SCHEDULE_RELATIONAL_READ:-false\}/,
  "VPS compose must default schedule relational reads to OFF"
);

console.log("WORKFORCE_SCHEDULE_READ_AUTHORITY_CONTRACT_OK");
