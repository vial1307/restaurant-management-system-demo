import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const { Client } = pg;
const env = { ...process.env };
const SITE = "fuxing";
const MONTH = "2026-10";
const workflow = fs.readFileSync(".github/workflows/workforce-payroll-history-production-backfill.yml", "utf8");
const client = new Client({
  host:env.DB_HOST || "127.0.0.1",
  port:Number(env.DB_PORT || 5432),
  database:env.POSTGRES_DB || "kitchen_test",
  user:env.POSTGRES_USER || "kitchen_test",
  password:env.POSTGRES_PASSWORD || "kitchen_test",
});

assert.match(workflow, /workflow_run:/);
assert.match(workflow, /Deploy Kitchen OS to VPS/);
assert.doesNotMatch(workflow, /\n  push:/);
assert.match(workflow, /head_branch == 'main'/);
assert.match(workflow, /head_sha/);
assert.match(workflow, /LOCAL_SCRIPT_SHA/);
assert.match(workflow, /REMOTE_SCRIPT_SHA/);
assert.match(workflow, /Creating mandatory pre-backfill database backup/);
assert.match(workflow, /GITHUB_EVENT_NAME.*workflow_dispatch/);

function run(script, args = [], expectSuccess = true) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd:process.cwd(), env, encoding:"utf8" });
  if (expectSuccess) assert.equal(result.status, 0, `${script} failed\n${result.stdout}\n${result.stderr}`);
  else assert.notEqual(result.status, 0, `${script} unexpectedly succeeded\n${result.stdout}`);
  return result;
}

function parseReport(output) {
  const marker = output.indexOf("\nWORKFORCE_PAYROLL_HISTORY_BACKFILL_");
  assert(marker > 0, `report marker missing: ${output}`);
  return JSON.parse(output.slice(output.indexOf("{"), marker));
}

function snap({ revision, lockedAt, breakMinutes, reopen = null, managerId }) {
  const workedMinutes = 480 - breakMinutes;
  const gross = Math.round(workedMinutes / 60 * 230);
  return {
    id:`${MONTH}-r${revision}`, month:MONTH, revision, formulaVersion:1, currency:"TWD",
    lockedAt, lockedByUserId:managerId, lockedByName:"Manager FX",
    policySnapshot:{ latePenaltyEnabled:false, lateGraceMinutes:5, latePenaltyMode:"none", latePenaltyAmount:0 },
    approvedAttendanceIds:["payroll-attendance-a"],
    attendanceRows:[{ attendanceId:"payroll-attendance-a", staffId:"staff-employee", staffName:"Employee", date:`${MONTH}-03`, breakMinutes, workedMinutes, gross, net:gross }],
    staffRows:[{ staffId:"staff-employee", staffName:"Employee", shifts:1, workedMinutes, gross, deduction:0, net:gross }],
    totals:{ shifts:1, workedMinutes, gross, deduction:0, net:gross },
    sourceReopen:reopen,
  };
}

await client.connect();
try {
  const managerResult = await client.query(`select id from public.app_users where username='managerfx'`);
  assert.equal(managerResult.rowCount, 1);
  const managerId = String(managerResult.rows[0].id);
  const policy = { latePenaltyEnabled:false, lateGraceMinutes:5, latePenaltyMode:"none", latePenaltyAmount:0 };
  const s1 = snap({ revision:1, lockedAt:`${MONTH}-03T12:00:00.000Z`, breakMinutes:60, managerId });
  const s2 = snap({
    revision:2,
    lockedAt:`${MONTH}-04T03:00:00.000Z`,
    breakMinutes:30,
    managerId,
    reopen:{ at:`${MONTH}-04T00:30:00.000Z`, byUserId:managerId, byName:"Manager FX", reason:"Correct break" },
  });
  const modules = {
    shared:{ staff:[{ id:"staff-employee", name:"Employee", role:"employee", area:"noodles", hourlyRate:230, active:true, accountUsername:"employeefx" }] },
    attendance:{
      attendance:[{
        id:"payroll-attendance-a", date:`${MONTH}-03`, staffId:"staff-employee", staffName:"Employee", area:"noodles", hourlyRate:230,
        scheduledStart:"10:00", clockIn:`${MONTH}-03T02:00:00.000Z`, clockOut:`${MONTH}-03T10:00:00.000Z`, breakMinutes:30,
        approvalStatus:"approved", approvedAt:`${MONTH}-04T02:00:00.000Z`, approvedByUserId:managerId, approvedByName:"Manager FX",
      }],
      payroll:{ ...policy, periods:{
        [MONTH]:{ month:MONTH, status:"locked", lockedAt:s2.lockedAt, lockedByUserId:managerId, lockedByName:"Manager FX", policySnapshot:policy, approvedAttendanceIds:["payroll-attendance-a"], currentRevision:2, history:[s1,s2] },
      } },
      correctionRequests:[],
    },
  };

  await client.query(`truncate table public.payroll_snapshots,public.payroll_periods restart identity cascade`);
  await client.query(`delete from public.attendance_records where site_code=$1`, [SITE]);
  await client.query(`delete from public.data_migration_checkpoints where site_code=$1 and migration_key in ('workforce.staff.v1','workforce.attendance.v1','workforce.payroll-history.v1')`, [SITE]);
  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision) values($1,$2::jsonb,$3::jsonb,50)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [SITE, JSON.stringify(modules), JSON.stringify({ shared:40, attendance:50 })]
  );

  run("vps/backend/scripts/workforce-staff-backfill.mjs", ["--apply", `--site=${SITE}`]);
  run("vps/backend/scripts/workforce-attendance-backfill.mjs", ["--apply", `--site=${SITE}`]);

  const verify = parseReport(run("vps/backend/scripts/workforce-payroll-history-backfill.mjs", [`--site=${SITE}`]).stdout);
  assert.equal(verify.apply, false);
  assert.equal(verify.sites[0].periods, 1);
  assert.equal(verify.sites[0].snapshots, 2);
  assert.equal(verify.sites[0].diagnostics.blocking, 0);
  assert.equal(verify.sites[0].relationalPeriods, 0);
  assert.equal((await client.query(`select count(*)::int n from public.payroll_periods where site_code=$1`, [SITE])).rows[0].n, 0);
  assert.equal((await client.query(`select count(*)::int n from public.payroll_policies where site_code=$1`, [SITE])).rows[0].n, 0);

  const applied = parseReport(run("vps/backend/scripts/workforce-payroll-history-backfill.mjs", ["--apply", `--site=${SITE}`]).stdout);
  assert.equal(applied.sites[0].periodRows, 1);
  assert.equal(applied.sites[0].snapshotRows, 2);
  const period = await client.query(`select id,status,current_snapshot_revision from public.payroll_periods where site_code=$1 and payroll_month=$2::date`, [SITE, `${MONTH}-01`]);
  assert.equal(period.rows[0].status, "locked");
  assert.equal(Number(period.rows[0].current_snapshot_revision), 2);
  const attendance = await client.query(`select id from public.attendance_records where site_code=$1 and legacy_attendance_id='payroll-attendance-a'`, [SITE]);
  let snapshots = await client.query(`select id,revision,approved_attendance_ids,attendance_facts,reopen_metadata from public.payroll_snapshots where payroll_period_id=$1 order by revision`, [period.rows[0].id]);
  assert.equal(snapshots.rowCount, 2);
  assert.deepEqual(snapshots.rows[0].approved_attendance_ids.map(String), [String(attendance.rows[0].id)]);
  assert.equal(snapshots.rows[0].attendance_facts[0].attendanceId, "payroll-attendance-a");
  assert.equal(snapshots.rows[1].reopen_metadata.reason, "Correct break");

  const periodId = String(period.rows[0].id);
  const snapshotIds = snapshots.rows.map((row) => String(row.id));
  run("vps/backend/scripts/workforce-payroll-history-backfill.mjs", ["--apply", `--site=${SITE}`]);
  assert.equal(String((await client.query(`select id from public.payroll_periods where site_code=$1 and payroll_month=$2::date`, [SITE, `${MONTH}-01`])).rows[0].id), periodId);
  snapshots = await client.query(`select id from public.payroll_snapshots where payroll_period_id=$1 order by revision`, [periodId]);
  assert.deepEqual(snapshots.rows.map((row) => String(row.id)), snapshotIds);

  const checkpoint = await client.query(`select source_revision,status,rows_read,checksum from public.data_migration_checkpoints where migration_key='workforce.payroll-history.v1' and site_code=$1`, [SITE]);
  assert.equal(Number(checkpoint.rows[0].source_revision), 50);
  assert.equal(checkpoint.rows[0].status, "verified");
  assert.equal(Number(checkpoint.rows[0].rows_read), 3);
  assert.match(checkpoint.rows[0].checksum, /^[a-f0-9]{64}$/);

  const tampered = structuredClone(modules);
  tampered.attendance.payroll.periods[MONTH].history[0].totals.net = 999999;
  await client.query(`update public.business_state set modules=$2::jsonb,module_revisions=jsonb_set(module_revisions,'{attendance}','51'::jsonb),revision=revision+1 where site=$1`, [SITE, JSON.stringify(tampered)]);
  const mismatch = run("vps/backend/scripts/workforce-payroll-history-backfill.mjs", ["--apply", `--site=${SITE}`], false);
  assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /WORKFORCE_PAYROLL_HISTORY_VERIFY_MISMATCH/);

  const unresolved = structuredClone(modules);
  unresolved.attendance.payroll.periods[MONTH].history[1].approvedAttendanceIds.push("missing-attendance");
  unresolved.attendance.payroll.periods[MONTH].history[1].attendanceRows.push({ attendanceId:"missing-attendance" });
  await client.query(`update public.business_state set modules=$2::jsonb,module_revisions=jsonb_set(module_revisions,'{attendance}','52'::jsonb),revision=revision+1 where site=$1`, [SITE, JSON.stringify(unresolved)]);
  const blocked = run("vps/backend/scripts/workforce-payroll-history-backfill.mjs", [`--site=${SITE}`], false);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /attendance_unresolved:missing-attendance/);

  console.log("WORKFORCE_PAYROLL_HISTORY_BACKFILL_REGRESSION_OK");
} finally {
  await client.end();
}
