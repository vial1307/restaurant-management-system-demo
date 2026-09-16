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

function runBackfill(...args) {
  return spawnSync(process.execPath, ["vps/backend/scripts/workforce-schedule-backfill.mjs", ...args], {
    cwd:process.cwd(), env, encoding:"utf8",
  });
}

await client.connect();
try {
  const departments = await client.query(
    `select code from public.organization_departments where site_code='central' and active=true order by code`
  );
  assert.deepEqual(departments.rows.map((row) => row.code), ["kitchen"]);

  await client.query(
    `insert into public.staff_members(
       site_code,staff_code,legacy_staff_id,display_name,department_code,employment_type,default_work_area,hourly_rate
     ) values('central','central-schedule-staff','central-schedule-staff','Central Schedule Staff','kitchen','parttime','noodles',230)`
  );

  const schedule = {
    id:"central-schedule-inside",
    staffId:"central-schedule-staff",
    staffName:"Central Schedule Staff",
    department:"inside",
    area:"noodles",
    applyMode:"day",
    date:"2026-10-07",
    month:"2026-10",
    weekday:3,
    shift:"evening",
    start:"17:00",
    end:"00:00",
    note:"legacy central inside department",
  };

  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values('central',$1::jsonb,$2::jsonb,1)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [JSON.stringify({ schedule:{ schedules:[schedule], publishedSchedules:[], requests:[], exceptions:[] } }), JSON.stringify({ schedule:1 })]
  );

  const verify = runBackfill("--site=central");
  assert.equal(verify.status, 0, `central verify failed\nSTDOUT:\n${verify.stdout}\nSTDERR:\n${verify.stderr}`);
  assert.match(verify.stdout, /WORKFORCE_SCHEDULE_BACKFILL_VERIFY_OK/);
  assert.doesNotMatch(verify.stdout, /invalid_department/);

  const apply = runBackfill("--apply", "--site=central");
  assert.equal(apply.status, 0, `central apply failed\nSTDOUT:\n${apply.stdout}\nSTDERR:\n${apply.stderr}`);
  assert.match(apply.stdout, /WORKFORCE_SCHEDULE_BACKFILL_OK/);

  const migrated = await client.query(
    `select department_code from public.workforce_schedule_entries
     where site_code='central' and legacy_schedule_id='central-schedule-inside'`
  );
  assert.equal(migrated.rowCount, 1);
  assert.equal(migrated.rows[0].department_code, "kitchen");

  const invalid = { ...schedule, department:"outside" };
  await client.query(
    `update public.business_state
     set modules=$1::jsonb,module_revisions=$2::jsonb,revision=revision+1,updated_at=now()
     where site='central'`,
    [JSON.stringify({ schedule:{ schedules:[invalid], publishedSchedules:[], requests:[], exceptions:[] } }), JSON.stringify({ schedule:2 })]
  );

  const blocked = runBackfill("--site=central");
  assert.equal(blocked.status, 2, `unexpected status for invalid central department\nSTDOUT:\n${blocked.stdout}\nSTDERR:\n${blocked.stderr}`);
  assert.match(blocked.stdout, /invalid_department/);
  assert.match(blocked.stdout, /WORKFORCE_SCHEDULE_BACKFILL_VERIFY_BLOCKED/);

  const unchanged = await client.query(
    `select department_code from public.workforce_schedule_entries
     where site_code='central' and legacy_schedule_id='central-schedule-inside'`
  );
  assert.equal(unchanged.rows[0].department_code, "kitchen", "verify-only must not mutate migrated rows");

  console.log("WORKFORCE_SCHEDULE_CENTRAL_DEPARTMENT_REGRESSION_OK");
} finally {
  await client.end();
}
