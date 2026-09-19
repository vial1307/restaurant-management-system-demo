import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = process.env.KITCHEN_REGRESSION_PASSWORD || ["Kitchen","Test","123"].join("");

async function request(path, { method="GET", cookie="", body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers:{
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type":"application/json" } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}

async function login(username) {
  const result = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password:PASSWORD },
  });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  const setCookie = result.response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert(cookie.includes("="), "session cookie missing");
  return cookie;
}

const cookie = await login("yangchuadmin");
const initial = await request("/api/business-state/fuxing", { cookie });
assert.equal(initial.response.status, 200);
assert.equal(
  initial.data?.readAuthorities?.schedule,
  "relational-primary",
  "full regression API must run with relational schedule read authority enabled"
);

const shared = initial.data?.modules?.shared && typeof initial.data.modules.shared === "object"
  ? structuredClone(initial.data.modules.shared)
  : {};
const schedule = initial.data?.modules?.schedule && typeof initial.data.modules.schedule === "object"
  ? structuredClone(initial.data.modules.schedule)
  : {};

const staffId = "cutover-cert-staff";
const scheduleId = "cutover-cert-schedule";
const staff = {
  id:staffId,
  name:"Cutover Certification",
  role:"employee",
  area:"noodles",
  hourlyRate:231,
  active:true,
  pin:"",
  accountUsername:"",
};
const entry = {
  id:scheduleId,
  staffId,
  staffName:staff.name,
  department:"inside",
  area:"noodles",
  applyMode:"day",
  date:"2026-10-20",
  month:"2026-10",
  weekday:2,
  shift:"evening",
  start:"17:00",
  end:"23:30",
  note:"relational-read-canary-v1",
};

shared.staff = [
  ...(Array.isArray(shared.staff) ? shared.staff.filter((item) => String(item?.id || "") !== staffId) : []),
  staff,
];
schedule.schedules = [
  ...(Array.isArray(schedule.schedules) ? schedule.schedules.filter((item) => String(item?.id || "") !== scheduleId) : []),
  entry,
];

const revisions = initial.data?.moduleRevisions || {};
assert(Number.isInteger(Number(revisions.shared)), "shared revision missing");
assert(Number.isInteger(Number(revisions.schedule)), "schedule revision missing");

const saved = await request("/api/business-state/fuxing", {
  method:"POST",
  cookie,
  body:{
    modules:{ shared, schedule },
    expectedModuleRevisions:{
      shared:Number(revisions.shared),
      schedule:Number(revisions.schedule),
    },
  },
});
assert.equal(saved.response.status, 200, `cutover canary save failed: ${JSON.stringify(saved.data)}`);
assert.deepEqual(new Set(saved.data.savedModules), new Set(["shared","schedule"]));

const readBack = await request("/api/business-state/fuxing", { cookie });
assert.equal(readBack.response.status, 200);
assert.equal(readBack.data?.readAuthorities?.schedule, "relational-primary");
const projected = readBack.data?.modules?.schedule?.schedules?.find((item) => item.id === scheduleId);
assert(projected, "relational schedule projection did not return the newly written canary row");
assert.equal(projected.staffId, staffId);
assert.equal(projected.note, "relational-read-canary-v1");

const relational = await request("/api/workforce/fuxing/schedule-relational-state", { cookie });
assert.equal(relational.response.status, 200);
assert.equal(relational.data?.authority, "relational-primary");
assert.equal(relational.data?.cutover, true);
const directProjected = relational.data?.schedule?.schedules?.find((item) => item.id === scheduleId);
assert(directProjected, "diagnostic relational endpoint missing canary row");
assert.deepEqual(directProjected, projected, "business-state and direct relational projections diverged");

const nextSchedule = structuredClone(readBack.data.modules.schedule);
nextSchedule.schedules = nextSchedule.schedules.map((item) => (
  item.id === scheduleId ? { ...item, note:"relational-read-canary-v2" } : item
));
const nextRevision = Number(readBack.data?.moduleRevisions?.schedule);
assert(Number.isInteger(nextRevision), "post-write schedule revision missing");

const updated = await request("/api/business-state/fuxing", {
  method:"POST",
  cookie,
  body:{
    modules:{ schedule:nextSchedule },
    expectedModuleRevisions:{ schedule:nextRevision },
  },
});
assert.equal(updated.response.status, 200, `cutover canary update failed: ${JSON.stringify(updated.data)}`);

const finalRead = await request("/api/business-state/fuxing", { cookie });
assert.equal(finalRead.response.status, 200);
assert.equal(
  finalRead.data.modules.schedule.schedules.find((item) => item.id === scheduleId)?.note,
  "relational-read-canary-v2",
  "relational read did not reflect the transactional write-through update"
);

console.log("WORKFORCE_SCHEDULE_RELATIONAL_READ_CANARY_OK");
