import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const env = { ...process.env };
const client = new Client({
  host:env.DB_HOST || "127.0.0.1",
  port:Number(env.DB_PORT || 5432),
  database:env.POSTGRES_DB || "kitchen_test",
  user:env.POSTGRES_USER || "kitchen_test",
  password:env.POSTGRES_PASSWORD || "kitchen_test",
});

function runBackfillRaw(...args) {
  return spawnSync(process.execPath, ["vps/backend/scripts/workforce-schedule-backfill.mjs", ...args], {
    cwd:process.cwd(), env, encoding:"utf8",
  });
}

function runBackfill(...args) {
  const result = runBackfillRaw(...args);
  assert.equal(result.status, 0, `schedule backfill failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result.stdout;
}

await client.connect();
try {
  const departments = await client.query(
    `select code from public.organization_departments where site_code='central' and active=true order by code`
  );
  assert.deepEqual(departments.rows.map((row) => row.code), ["kitchen"], "central canonical department must remain kitchen-only");

  const insertedStaff = await client.query(
    `insert into public.staff_members(
       site_code,staff_code,legacy_staff_id,display_name,department_code,employment_type,default_work_area,hourly_rate
     ) values('central','central-compat-staff','central-compat-staff','Central Compat Staff','kitchen','parttime','prep',230)
     returning id`
  );
  const staffId = String(insertedStaff.rows[0].id);

  const schedule = {
    id:"central-legacy-inside", staffId:"central-compat-staff", staffName:"Central Compat Staff",
    department:"inside", area:"prep", applyMode:"day", date:"2026-10-08", month:"2026-10", weekday:4,
    shift:"morning", start:"09:00", end:"17:00", note:"legacy central schedule",
  };
  const approvedRequest = {
    id:"central-compat-request", type:"change", staffId:"central-compat-staff", staffName:"Central Compat Staff",
    date:"2026-10-08", sourceScheduleId:"central-legacy-inside", sourceSnapshot:{ ...schedule },
    requestedStart:"10:00", requestedEnd:"18:00", reason:"central compatibility regression", status:"approved",
    createdAt:"2026-09-16T01:00:00.000Z", createdByName:"central-compat",
    decidedAt:"2026-09-16T01:30:00.000Z", decidedByName:"central-manager", decisionNote:"approved",
    exceptionId:"central-compat-exception",
  };
  const exception = {
    id:"central-compat-exception", requestId:"central-compat-request", staffId:"central-compat-staff",
    staffName:"Central Compat Staff", date:"2026-10-08", kind:"override", sourceScheduleId:"central-legacy-inside",
    start:"10:00", end:"18:00", department:"inside", area:"prep", shift:"morning",
    approvedAt:"2026-09-16T01:30:00.000Z", approvedByName:"central-manager",
  };
  const module = {
    schedules:[schedule],
    publishedSchedules:[structuredClone(schedule)],
    publication:{
      version:1, publishedAt:"2026-09-16T00:30:00.000Z", publishedByName:"central-manager",
      scheduleCount:1, sourceModuleRevision:21,
    },
    requests:[approvedRequest],
    exceptions:[exception],
  };

  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values('central',$1::jsonb,$2::jsonb,21)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,
       revision=excluded.revision,updated_at=now()`,
    [JSON.stringify({ schedule:module }), JSON.stringify({ schedule:21 })]
  );

  const verify = runBackfill("--site=central");
  assert.match(verify, /WORKFORCE_SCHEDULE_BACKFILL_VERIFY_OK/);
  assert.doesNotMatch(verify, /invalid_department/);

  const applied = runBackfill("--apply", "--site=central");
  assert.match(applied, /WORKFORCE_SCHEDULE_BACKFILL_OK/);

  const draft = await client.query(
    `select staff_id,department_code,legacy_schedule_id
     from public.workforce_schedule_entries
     where site_code='central' and legacy_schedule_id='central-legacy-inside'`
  );
  assert.equal(draft.rowCount, 1);
  assert.equal(String(draft.rows[0].staff_id), staffId);
  assert.equal(draft.rows[0].department_code, "kitchen");

  const published = await client.query(
    `select e.department_code,e.legacy_schedule_id
     from public.workforce_schedule_publication_entries e
     join public.workforce_schedule_publications p on p.id=e.publication_id
     where p.site_code='central' and p.version=1 and e.legacy_schedule_id='central-legacy-inside'`
  );
  assert.equal(published.rowCount, 1);
  assert.equal(published.rows[0].department_code, "kitchen");

  const override = await client.query(
    `select department_code,legacy_exception_id
     from public.workforce_schedule_exceptions
     where site_code='central' and legacy_exception_id='central-compat-exception'`
  );
  assert.equal(override.rowCount, 1);
  assert.equal(override.rows[0].department_code, "kitchen");

  const invalidModule = structuredClone(module);
  invalidModule.schedules = [{ ...schedule, id:"central-unknown-department", department:"outside" }];
  invalidModule.publishedSchedules = [];
  invalidModule.publication = {};
  invalidModule.requests = [];
  invalidModule.exceptions = [];
  await client.query(
    `update public.business_state
     set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now()
     where site=$1`,
    ["central", JSON.stringify({ schedule:invalidModule }), JSON.stringify({ schedule:22 })]
  );

  const blocked = runBackfillRaw("--site=central");
  assert.equal(blocked.status, 2, `unknown central department must remain blocked\nSTDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.match(blocked.stdout, /invalid_department/);
  assert.match(blocked.stdout, /WORKFORCE_SCHEDULE_BACKFILL_VERIFY_BLOCKED/);

  console.log("WORKFORCE_SCHEDULE_CENTRAL_COMPAT_REGRESSION_OK");
} finally {
  await client.end();
}
