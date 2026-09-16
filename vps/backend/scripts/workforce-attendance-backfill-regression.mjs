import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const { Client } = pg;
const env = { ...process.env };
const SITE = "fuxing";
const productionWorkflow = fs.readFileSync(".github/workflows/workforce-attendance-production-backfill.yml", "utf8");
const client = new Client({
  host:env.DB_HOST || "127.0.0.1",
  port:Number(env.DB_PORT || 5432),
  database:env.POSTGRES_DB || "kitchen_test",
  user:env.POSTGRES_USER || "kitchen_test",
  password:env.POSTGRES_PASSWORD || "kitchen_test",
});

assert.match(productionWorkflow, /workflow_run:/, "production verification must follow workflow completion");
assert.match(productionWorkflow, /Deploy Kitchen OS to VPS/, "production verification must follow canonical deploy");
assert.doesNotMatch(productionWorkflow, /\n  push:/, "production verification must not race deploy through push");
assert.match(productionWorkflow, /github\.event\.workflow_run\.conclusion == 'success'/, "automatic verification must require deploy success");
assert.match(productionWorkflow, /github\.event\.workflow_run\.head_branch == 'main'/, "automatic verification must remain main-only");
assert.match(productionWorkflow, /github\.event\.workflow_run\.head_sha/, "automatic verification must pin deployed SHA");
assert.match(productionWorkflow, /LOCAL_SCRIPT_SHA/, "production workflow must verify local script checksum");
assert.match(productionWorkflow, /REMOTE_SCRIPT_SHA/, "production workflow must verify remote script checksum");
assert.match(productionWorkflow, /Creating mandatory pre-backfill database backup/, "apply must create a backup first");
assert.match(productionWorkflow, /GITHUB_EVENT_NAME.*workflow_dispatch/, "automatic runs must remain verify-only");

function runBackfill(args = [], { expectSuccess = true } = {}) {
  const result = spawnSync(process.execPath, ["vps/backend/scripts/workforce-attendance-backfill.mjs", ...args], {
    cwd:process.cwd(),
    env,
    encoding:"utf8",
  });
  if (expectSuccess) {
    assert.equal(result.status, 0, `attendance backfill failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  } else {
    assert.notEqual(result.status, 0, `attendance backfill unexpectedly succeeded\nSTDOUT:\n${result.stdout}`);
  }
  return result;
}

function backfillReport(output) {
  const marker = output.indexOf("\nWORKFORCE_ATTENDANCE_BACKFILL_");
  assert(marker > 0, `attendance backfill report marker missing: ${output}`);
  return JSON.parse(output.slice(output.indexOf("{"), marker));
}

await client.connect();
try {
  const users = await client.query(
    `select id,username from public.app_users where username in ('managerfx','employeefx') order by username`
  );
  assert.equal(users.rowCount, 2, "attendance regression users missing");
  const manager = users.rows.find((row) => row.username === "managerfx");

  await client.query(`delete from public.attendance_corrections`);
  await client.query(`delete from public.attendance_records where site_code=$1`, [SITE]);
  await client.query(`delete from public.data_migration_checkpoints where migration_key='workforce.attendance.v1' and site_code=$1`, [SITE]);

  const modules = {
    shared:{
      staff:[
        { id:"staff-employee", name:"Employee", role:"employee", area:"soup", hourlyRate:220, active:true, accountUsername:"employeefx" },
        { id:"staff-parttime", name:"PT Worker", role:"parttime", area:"seafood", hourlyRate:225, active:true },
      ],
    },
    attendance:{
      attendance:[
        {
          id:"attendance-complete",
          date:"2026-10-03",
          staffId:"staff-employee",
          staffName:"Employee",
          area:"noodles",
          hourlyRate:230,
          scheduledStart:"10:00",
          clockIn:"2026-10-03T02:02:00.000Z",
          clockOut:"2026-10-03T10:00:00.000Z",
          breakMinutes:60,
          note:"approved shift",
          approvalStatus:"approved",
          approvedAt:"2026-10-03T11:00:00.000Z",
          approvedByUserId:String(manager.id),
          approvedByName:"Manager FX",
        },
        {
          id:"attendance-open",
          date:"2026-10-04",
          staffId:"staff-parttime",
          staffName:"PT Worker",
          area:"seafood",
          hourlyRate:225,
          scheduledStart:"17:00",
          clockIn:"2026-10-04T09:00:00.000Z",
          clockOut:null,
          breakMinutes:0,
          note:"open shift",
        },
      ],
      payroll:{},
      correctionRequests:[],
    },
  };

  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values($1,$2::jsonb,$3::jsonb,10)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [SITE, JSON.stringify(modules), JSON.stringify({ shared:20, attendance:30 })]
  );

  const staffBackfill = spawnSync(process.execPath, ["vps/backend/scripts/workforce-staff-backfill.mjs", "--apply", `--site=${SITE}`], {
    cwd:process.cwd(), env, encoding:"utf8",
  });
  assert.equal(staffBackfill.status, 0, `staff prerequisite backfill failed\n${staffBackfill.stdout}\n${staffBackfill.stderr}`);

  const verify = runBackfill([`--site=${SITE}`]);
  assert.match(verify.stdout, /WORKFORCE_ATTENDANCE_BACKFILL_VERIFY_OK/);
  const verifyReport = backfillReport(verify.stdout);
  assert.equal(verifyReport.apply, false);
  assert.equal(verifyReport.sites.length, 1);
  assert.equal(verifyReport.sites[0].attendanceRows, 2);
  assert.equal(verifyReport.sites[0].diagnostics.blocking, 0);
  assert.equal(verifyReport.sites[0].relationalRows, 0);
  assert.equal(verifyReport.sites[0].relationalMatch, false);
  assert.equal((await client.query(`select count(*)::int as count from public.attendance_records where site_code=$1`, [SITE])).rows[0].count, 0, "verify-only must not write attendance rows");

  const first = runBackfill(["--apply", `--site=${SITE}`]);
  assert.match(first.stdout, /WORKFORCE_ATTENDANCE_BACKFILL_OK/);
  const firstReport = backfillReport(first.stdout);
  assert.equal(firstReport.sites[0].rowsWritten, 2);
  assert.equal(firstReport.sites[0].targetRows, 2);

  let rows = await client.query(
    `select id,legacy_attendance_id,staff_id,service_date,clock_in_at,clock_out_at,scheduled_start_at,
            break_minutes,work_area,hourly_rate,currency_code,note,source,approval_status,
            approved_at,approved_by_user_id,approved_by_name,record_status,version
     from public.attendance_records where site_code=$1 order by legacy_attendance_id`,
    [SITE]
  );
  assert.equal(rows.rowCount, 2);
  const complete = rows.rows.find((row) => row.legacy_attendance_id === "attendance-complete");
  const open = rows.rows.find((row) => row.legacy_attendance_id === "attendance-open");
  assert(complete && open);
  assert.equal(complete.approval_status, "approved");
  assert.equal(complete.approved_by_name, "Manager FX");
  assert.equal(String(complete.approved_by_user_id), String(manager.id));
  assert.equal(complete.source, "migration");
  assert.equal(Number(complete.hourly_rate), 230);
  assert.equal(complete.break_minutes, 60);
  assert.equal(complete.currency_code, "TWD");
  assert.equal(new Date(complete.scheduled_start_at).toISOString(), "2026-10-03T02:00:00.000Z", "scheduled local time must respect Asia/Taipei");
  assert.equal(open.clock_out_at, null);
  assert.equal(open.approval_status, "pending");
  assert.equal(open.approved_at, null);

  const checkpoint = await client.query(
    `select source_revision,status,rows_read,rows_written,checksum,details
     from public.data_migration_checkpoints
     where migration_key='workforce.attendance.v1' and site_code=$1`,
    [SITE]
  );
  assert.equal(checkpoint.rowCount, 1);
  assert.equal(Number(checkpoint.rows[0].source_revision), 30);
  assert.equal(checkpoint.rows[0].status, "verified");
  assert.equal(Number(checkpoint.rows[0].rows_read), 2);
  assert.equal(Number(checkpoint.rows[0].rows_written), 2);
  assert.match(checkpoint.rows[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(checkpoint.rows[0].details.target, "attendance_records");

  const stableIds = new Map(rows.rows.map((row) => [row.legacy_attendance_id, String(row.id)]));
  runBackfill(["--apply", `--site=${SITE}`]);
  rows = await client.query(
    `select id,legacy_attendance_id from public.attendance_records where site_code=$1 order by legacy_attendance_id`,
    [SITE]
  );
  assert.equal(rows.rowCount, 2, "idempotent rerun must not duplicate attendance rows");
  for (const row of rows.rows) {
    assert.equal(String(row.id), stableIds.get(row.legacy_attendance_id), "idempotent rerun changed attendance identity");
  }

  const changedModules = structuredClone(modules);
  const changed = changedModules.attendance.attendance.find((row) => row.id === "attendance-complete");
  changed.breakMinutes = 30;
  changed.hourlyRate = 235;
  changed.note = "corrected source projection";
  await client.query(
    `update public.business_state
     set modules=$2::jsonb,module_revisions=jsonb_set(module_revisions,'{attendance}','31'::jsonb),revision=revision+1,updated_at=now()
     where site=$1`,
    [SITE, JSON.stringify(changedModules)]
  );
  runBackfill(["--apply", `--site=${SITE}`]);
  const changedRow = await client.query(
    `select id,break_minutes,hourly_rate,note from public.attendance_records
     where site_code=$1 and legacy_attendance_id='attendance-complete'`,
    [SITE]
  );
  assert.equal(String(changedRow.rows[0].id), stableIds.get("attendance-complete"));
  assert.equal(changedRow.rows[0].break_minutes, 30);
  assert.equal(Number(changedRow.rows[0].hourly_rate), 235);
  assert.equal(changedRow.rows[0].note, "corrected source projection");

  const invalidModules = structuredClone(changedModules);
  invalidModules.attendance.attendance.push({
    id:"attendance-unresolved",
    date:"2026-10-05",
    staffId:"missing-staff",
    hourlyRate:220,
    clockIn:"2026-10-05T02:00:00.000Z",
    clockOut:"2026-10-05T10:00:00.000Z",
    breakMinutes:0,
  });
  await client.query(
    `update public.business_state
     set modules=$2::jsonb,module_revisions=jsonb_set(module_revisions,'{attendance}','32'::jsonb),revision=revision+1,updated_at=now()
     where site=$1`,
    [SITE, JSON.stringify(invalidModules)]
  );
  const blocked = runBackfill([`--site=${SITE}`], { expectSuccess:false });
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /staff_unresolved/, "unresolved staff must block migration readiness");
  assert.equal((await client.query(`select count(*)::int as count from public.attendance_records where site_code=$1`, [SITE])).rows[0].count, 2, "blocked verify must not mutate relational attendance");

  console.log("WORKFORCE_ATTENDANCE_BACKFILL_REGRESSION_OK");
} finally {
  await client.end();
}
