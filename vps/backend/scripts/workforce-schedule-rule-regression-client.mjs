import assert from "node:assert/strict";
import { pool } from "../src/db.mjs";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const DATE = "2037-05-05";
const SCHEDULE_ID = "schedule-rule-regression-employee";

const RULE_A = {
  shifts:{
    morning:{ start:"09:30", end:"15:30" },
    evening:{ start:"17:00", end:"23:00" },
    full:{ start:"09:30", end:"23:00" },
  },
  staffingBands:[
    { minTables:0, maxTables:2, requiredInside:2, fixedAreas:false, needsReview:true },
    { minTables:3, maxTables:5, requiredInside:3, fixedAreas:false, needsReview:false },
    { minTables:6, maxTables:10, requiredInside:4, fixedAreas:true, needsReview:false },
    { minTables:11, maxTables:null, requiredInside:5, fixedAreas:true, needsReview:true },
  ],
};

const RULE_B = {
  shifts:{
    morning:{ start:"09:00", end:"15:00" },
    evening:{ start:"18:00", end:"23:30" },
    full:{ start:"09:00", end:"23:30" },
  },
  staffingBands:[
    { minTables:0, maxTables:1, requiredInside:1, fixedAreas:false, needsReview:true },
    { minTables:2, maxTables:4, requiredInside:2, fixedAreas:false, needsReview:false },
    { minTables:5, maxTables:8, requiredInside:3, fixedAreas:true, needsReview:false },
    { minTables:9, maxTables:null, requiredInside:4, fixedAreas:true, needsReview:true },
  ],
};

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers:{
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie:response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function login(username) {
  const result = await request("/api/auth/login", { method:"POST", body:{ username, password:PASSWORD } });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `login cookie missing for ${username}`);
  return result.cookie;
}

async function readState(cookie) {
  const result = await request(`/api/business-state/${SITE}`, { cookie });
  assert.equal(result.response.status, 200, `state read failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function saveScheduleModule(cookie, mutate) {
  const state = await readState(cookie);
  const module = structuredClone(state.modules.schedule || { schedules:[] });
  module.schedules ??= [];
  mutate(module);
  const revision = state.moduleRevisions.schedule;
  assert(Number.isInteger(revision), "schedule module revision missing");
  return request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules:{ schedule:module }, expectedModuleRevisions:{ schedule:revision } },
  });
}

const admin = await login("yangchuadmin");
const manager = await login("managerfx");
const supervisor = await login("supervisorfx");
const employee = await login("employeefx");
const parttime = await login("parttimefx");

const initial = await readState(manager);
const initialRevision = initial.moduleRevisions.schedule;
assert(Number.isInteger(initialRevision));

const savedA = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:RULE_A });
assert.equal(savedA.response.status, 200, `manager rule save failed: ${JSON.stringify(savedA.data)}`);
assert.equal(savedA.data.unchanged, false);
assert.equal(savedA.data.rules.version, 1);
assert.equal(savedA.data.rules.shifts.evening.start, "17:00");
assert.equal(savedA.data.rules.staffingBands[1].minTables, 3);
assert.equal(savedA.data.moduleRevision, initialRevision + 1);
assert(savedA.data.rules.updatedByUserId, "rule actor must be server generated");

const employeeScoped = await readState(employee);
assert.equal(Object.hasOwn(employeeScoped.modules.schedule || {}, "rules"), false, "employee must not receive manager staffing rules");
const parttimeScoped = await readState(parttime);
assert.equal(Object.hasOwn(parttimeScoped.modules.schedule || {}, "rules"), false, "part-time must not receive manager staffing rules");

for (const [label, cookie] of [["supervisor", supervisor], ["employee", employee], ["parttime", parttime]]) {
  const denied = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie, body:RULE_B });
  assert.equal(denied.response.status, 403, `${label} must not mutate schedule rules`);
  assert.equal(denied.data.error, "WORKFORCE_SCHEDULE_MANAGER_REQUIRED");
}

const invalidTime = structuredClone(RULE_A);
invalidTime.shifts.evening.end = invalidTime.shifts.evening.start;
let invalid = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:invalidTime });
assert.equal(invalid.response.status, 400, "identical shift start/end must fail");
assert.equal(invalid.data.error, "WORKFORCE_SCHEDULE_RULE_TIME_INVALID");

const invalidBoolean = structuredClone(RULE_A);
invalidBoolean.staffingBands[1].fixedAreas = "false";
invalid = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:invalidBoolean });
assert.equal(invalid.response.status, 400, "string boolean must fail strict validation");
assert.equal(invalid.data.error, "WORKFORCE_SCHEDULE_RULE_BANDS_INVALID");

const invalidGap = structuredClone(RULE_A);
invalidGap.staffingBands[1].minTables = 4;
invalid = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:invalidGap });
assert.equal(invalid.response.status, 400, "non-contiguous staffing bands must fail");
assert.equal(invalid.data.error, "WORKFORCE_SCHEDULE_RULE_BANDS_INVALID");

const noOp = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:RULE_A });
assert.equal(noOp.response.status, 200);
assert.equal(noOp.data.unchanged, true, "identical rule save must be idempotent");
assert.equal(noOp.data.rules.version, 1, "no-op rule save must not increment version");
assert.equal(noOp.data.moduleRevision, savedA.data.moduleRevision, "no-op rule save must not increment module revision");

const generic = await saveScheduleModule(manager, (module) => {
  module.rules = { version:999, shifts:{ forged:true }, staffingBands:[] };
  module.schedules = module.schedules.filter((entry) => entry.id !== SCHEDULE_ID);
  module.schedules.unshift({
    id:SCHEDULE_ID,
    date:DATE,
    month:DATE.slice(0, 7),
    weekday:new Date(`${DATE}T12:00:00Z`).getUTCDay(),
    applyMode:"day",
    staffId:"staff-employee",
    staffName:"employeefx",
    department:"inside",
    area:"noodles",
    shift:"evening",
    start:"17:00",
    end:"23:00",
    note:"rule regression source schedule",
  });
});
assert.equal(generic.response.status, 200, `generic schedule save failed: ${JSON.stringify(generic.data)}`);

let managerState = await readState(manager);
assert.equal(managerState.modules.schedule.rules.version, 1, "generic schedule save forged server-owned rules");
assert.deepEqual(managerState.modules.schedule.rules.shifts, savedA.data.rules.shifts, "generic schedule save changed canonical shift rules");
let assignment = managerState.modules.schedule.schedules.find((entry) => entry.id === SCHEDULE_ID);
assert(assignment, "source schedule missing after generic save");
assert.equal(assignment.start, "17:00");
assert.equal(assignment.end, "23:00");

const requestCreate = await request(`/api/workforce/${SITE}/schedule-requests`, {
  method:"POST",
  cookie:employee,
  body:{ type:"change", date:DATE, requestedStart:"17:30", requestedEnd:"23:00", reason:"Schedule rules regression request" },
});
assert.equal(requestCreate.response.status, 200, `employee change request failed: ${JSON.stringify(requestCreate.data)}`);
const requestId = requestCreate.data.request.id;

const savedB = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:RULE_B });
assert.equal(savedB.response.status, 200, `second rule save failed: ${JSON.stringify(savedB.data)}`);
assert.equal(savedB.data.rules.version, 2);
assert.equal(savedB.data.rules.shifts.evening.start, "18:00");

managerState = await readState(manager);
assignment = managerState.modules.schedule.schedules.find((entry) => entry.id === SCHEDULE_ID);
assert.equal(assignment.start, "17:00", "rule update must not rewrite existing assignment start");
assert.equal(assignment.end, "23:00", "rule update must not rewrite existing assignment end");

const approveRequest = await request(`/api/workforce/${SITE}/schedule-requests/${requestId}/approve`, {
  method:"POST",
  cookie:manager,
  body:{ note:"Stored schedule is unchanged" },
});
assert.equal(approveRequest.response.status, 200, `rule edit must not make pending schedule request stale: ${JSON.stringify(approveRequest.data)}`);
assert.equal(approveRequest.data.request.status, "approved");

const audit = await pool.query(
  "select action,entity_type,site,metadata from public.audit_logs where action='workforce-schedule-rules-update' and site=$1 order by created_at asc",
  [SITE]
);
assert.equal(audit.rows.length, 2, "two real rule changes must create exactly two rule audit rows");
assert(audit.rows.every((row) => row.entity_type === "schedule_rules"), "rule audit entity type mismatch");
assert.deepEqual(audit.rows.map((row) => Number(row.metadata?.version)), [1, 2], "audit versions must track canonical rule versions");

await pool.end();
console.log("WORKFORCE_SCHEDULE_RULES_API_OK");
