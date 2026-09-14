import assert from "node:assert/strict";
import { pool } from "../src/db.mjs";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const SITE = "fuxing";
const PASSWORD = "KitchenTest!123";

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(API + path, {
    method,
    headers:{
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return {
    response,
    data,
    cookie:response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}

async function login(username) {
  const result = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password:PASSWORD },
  });
  assert.equal(result.response.status, 200, `login failed for ${username}: ${JSON.stringify(result.data)}`);
  assert(result.cookie, `login cookie missing for ${username}`);
  return result.cookie;
}

async function state(cookie) {
  const result = await request(`/api/business-state/${SITE}`, { cookie });
  assert.equal(result.response.status, 200, `business state read failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function saveModules(cookie, modules, expectedModuleRevisions) {
  const result = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie,
    body:{ modules, expectedModuleRevisions },
  });
  assert.equal(result.response.status, 200, `business state save failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

const adminCookie = await login("yangchuadmin");
const managerCookie = await login("managerfx");
const supervisorCookie = await login("supervisorfx");
const employeeCookie = await login("employeefx");

try {
  const initial = await state(adminCookie);
  const employeeShift = {
    id:"publication-draft-employee",
    date:"2036-02-10",
    month:"2036-02",
    weekday:0,
    applyMode:"day",
    staffId:"staff-employee",
    staffName:"employeefx",
    department:"inside",
    area:"soup",
    shift:"evening",
    start:"17:00",
    end:"22:00",
  };
  const otherShift = {
    ...employeeShift,
    id:"publication-draft-other",
    staffId:"staff-other",
    staffName:"otherfx",
    area:"noodles",
    start:"16:00",
  };
  await saveModules(
    adminCookie,
    {
      shared:{
        staff:[
          { id:"staff-employee", name:"employeefx", accountUsername:"employeefx", hourlyRate:220, area:"soup" },
          { id:"staff-other", name:"otherfx", hourlyRate:230, area:"noodles" },
        ],
      },
      schedule:{
        schedules:[employeeShift, otherShift],
        requests:[],
        exceptions:[],
      },
    },
    {
      shared:Number(initial.moduleRevisions?.shared || 0),
      schedule:Number(initial.moduleRevisions?.schedule || 0),
    }
  );

  const seeded = await state(adminCookie);
  const seededRevision = Number(seeded.moduleRevisions.schedule);
  assert(Number.isInteger(seededRevision) && seededRevision >= 1, "seeded schedule revision missing");

  const supervisorDenied = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:supervisorCookie,
    body:{ expectedModuleRevision:seededRevision },
  });
  assert.equal(supervisorDenied.response.status, 403, "supervisor must not publish schedules");

  const employeeDenied = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:employeeCookie,
    body:{ expectedModuleRevision:seededRevision },
  });
  assert.equal(employeeDenied.response.status, 403, "employee must not publish schedules");

  const missingRevision = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:managerCookie,
    body:{},
  });
  assert.equal(missingRevision.response.status, 409, "publish must require the reviewed schedule revision");
  assert.equal(missingRevision.data?.error, "WORKFORCE_SCHEDULE_PUBLISH_REVISION_REQUIRED");

  const revisionConflict = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:managerCookie,
    body:{ expectedModuleRevision:seededRevision + 1 },
  });
  assert.equal(revisionConflict.response.status, 409, "stale/unseen revision must block publish");
  assert.equal(revisionConflict.data?.error, "WORKFORCE_SCHEDULE_PUBLISH_CONFLICT");
  assert.equal(revisionConflict.data?.moduleRevision, seededRevision);

  const firstPublish = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:managerCookie,
    body:{ expectedModuleRevision:seededRevision },
  });
  assert.equal(firstPublish.response.status, 200, `first publish failed: ${JSON.stringify(firstPublish.data)}`);
  assert.equal(firstPublish.data?.unchanged, false);
  assert.equal(firstPublish.data?.publication?.version, 1);
  assert.equal(firstPublish.data?.publication?.scheduleCount, 2);
  assert.equal(firstPublish.data?.publication?.sourceModuleRevision, seededRevision);
  assert.equal(firstPublish.data?.moduleRevision, seededRevision + 1);

  const afterFirstPublish = await state(adminCookie);
  assert.deepEqual(
    afterFirstPublish.modules.schedule.publishedSchedules,
    afterFirstPublish.modules.schedule.schedules,
    "published snapshot must exactly match the reviewed server draft"
  );
  assert.equal(afterFirstPublish.modules.schedule.publication.version, 1);

  const employeeAfterFirstPublish = await state(employeeCookie);
  assert.deepEqual(
    employeeAfterFirstPublish.modules.schedule.schedules.map((entry) => [entry.id, entry.start]),
    [["publication-draft-employee", "17:00"]],
    "employee must receive only their own published shift"
  );
  assert.equal(
    Object.hasOwn(employeeAfterFirstPublish.modules.schedule, "publishedSchedules"),
    false,
    "employee API must never expose branch-wide publishedSchedules"
  );
  assert.equal(employeeAfterFirstPublish.modules.schedule.publication.version, 1);

  const firstPublishedRevision = Number(afterFirstPublish.moduleRevisions.schedule);
  const changedDraft = structuredClone(afterFirstPublish.modules.schedule);
  changedDraft.schedules[0] = { ...changedDraft.schedules[0], start:"18:00" };
  await saveModules(
    adminCookie,
    { schedule:changedDraft },
    { schedule:firstPublishedRevision }
  );

  const afterDraftChange = await state(adminCookie);
  assert.equal(afterDraftChange.modules.schedule.schedules[0].start, "18:00", "manager draft change was not saved");
  assert.equal(afterDraftChange.modules.schedule.publishedSchedules[0].start, "17:00", "generic draft save overwrote published snapshot");
  assert.equal(afterDraftChange.modules.schedule.publication.version, 1, "generic draft save overwrote publication metadata");

  const employeeBeforeRepublish = await state(employeeCookie);
  assert.equal(
    employeeBeforeRepublish.modules.schedule.schedules[0].start,
    "17:00",
    "employee must not see unpublished manager draft changes"
  );

  const draftRevision = Number(afterDraftChange.moduleRevisions.schedule);
  const secondPublish = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:managerCookie,
    body:{ expectedModuleRevision:draftRevision },
  });
  assert.equal(secondPublish.response.status, 200, `second publish failed: ${JSON.stringify(secondPublish.data)}`);
  assert.equal(secondPublish.data?.unchanged, false);
  assert.equal(secondPublish.data?.publication?.version, 2);
  assert.equal(secondPublish.data?.moduleRevision, draftRevision + 1);

  const employeeAfterRepublish = await state(employeeCookie);
  assert.equal(employeeAfterRepublish.modules.schedule.schedules[0].start, "18:00", "employee did not receive newly published draft");
  assert.equal(employeeAfterRepublish.modules.schedule.publication.version, 2);

  const afterSecondPublish = await state(managerCookie);
  const idempotentRevision = Number(afterSecondPublish.moduleRevisions.schedule);
  const idempotent = await request(`/api/workforce/${SITE}/schedule-publish`, {
    method:"POST",
    cookie:managerCookie,
    body:{ expectedModuleRevision:idempotentRevision },
  });
  assert.equal(idempotent.response.status, 200, `idempotent publish failed: ${JSON.stringify(idempotent.data)}`);
  assert.equal(idempotent.data?.unchanged, true, "unchanged schedule publish must be idempotent");
  assert.equal(idempotent.data?.moduleRevision, idempotentRevision, "idempotent publish must not bump module revision");
  assert.equal(idempotent.data?.publication?.version, 2, "idempotent publish must not bump publication version");

  const audit = await pool.query(
    `select action,entity_type,site,metadata
       from public.audit_logs
      where action='workforce-schedule-publish' and site=$1
      order by created_at asc`,
    [SITE]
  );
  assert.equal(audit.rowCount, 2, "only changed publishes should create publication audit rows");
  assert.deepEqual(audit.rows.map((row) => Number(row.metadata?.version)), [1, 2]);
  assert(audit.rows.every((row) => row.entity_type === "schedule_publication"));

  console.log("WORKFORCE_SCHEDULE_PUBLICATION_API_REGRESSION_OK");
} finally {
  await pool.end();
}
