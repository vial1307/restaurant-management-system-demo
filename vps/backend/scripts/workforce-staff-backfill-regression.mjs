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
  const result = spawnSync(process.execPath, ["vps/backend/scripts/workforce-staff-backfill.mjs", ...args], {
    cwd:process.cwd(),
    env,
    encoding:"utf8",
  });
  assert.equal(result.status, 0, `backfill failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result.stdout;
}

function backfillReport(output) {
  const marker = output.indexOf("\nWORKFORCE_STAFF_BACKFILL_");
  assert(marker > 0, `backfill report marker missing: ${output}`);
  return JSON.parse(output.slice(output.indexOf("{"), marker));
}

await client.connect();
try {
  const users = await client.query(
    `select id,username from public.app_users where username in ('employeefx','parttimefx') order by username`
  );
  assert.equal(users.rowCount, 2, "regression users missing");
  const employee = users.rows.find((row) => row.username === "employeefx");

  const modules = {
    shared:{
      staff:[
        {
          id:"staff-employee",
          name:"employeefx",
          role:"employee",
          area:"soup",
          hourlyRate:220,
          active:true,
          accountUsername:"employeefx",
        },
        {
          id:"staff-parttime",
          name:"PT Worker",
          role:"parttime",
          area:"seafood",
          hourlyRate:225,
          active:true,
        },
      ],
    },
  };

  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values('fuxing',$1::jsonb,$2::jsonb,4)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [JSON.stringify(modules), JSON.stringify({ shared:7 })]
  );

  const verifyOutput = runBackfill("--site=fuxing");
  assert.match(verifyOutput, /WORKFORCE_STAFF_BACKFILL_VERIFY_OK/);
  const verifyReport = backfillReport(verifyOutput);
  assert.equal(verifyReport.apply, false);
  assert.equal(verifyReport.sites.length, 1);
  assert.equal(verifyReport.sites[0].rosterRows, 2);
  assert.equal(verifyReport.sites[0].bindableRows, 1);
  assert.equal(verifyReport.sites[0].unboundRows, 1);
  assert.deepEqual(verifyReport.sites[0].bindingOutcomes, {
    bound:1,
    no_match:1,
    ambiguous:0,
    claimed:0,
    missing_identity:0,
  });
  assert.deepEqual(verifyReport.sites[0].bindingMethods, {
    explicit_user_id:0,
    explicit_username:1,
    display_name:1,
    none:0,
  });
  assert.equal((await client.query(`select count(*)::int as count from public.staff_members where site_code='fuxing'`)).rows[0].count, 0, "verify-only must not write staff rows");

  const firstOutput = runBackfill("--apply", "--site=fuxing");
  assert.match(firstOutput, /WORKFORCE_STAFF_BACKFILL_OK/);
  const firstReport = backfillReport(firstOutput);
  assert.equal(firstReport.sites[0].staffWritten, 2);
  assert.equal(firstReport.sites[0].bindingsWritten, 1);
  assert.deepEqual(firstReport.sites[0].bindingOutcomes, verifyReport.sites[0].bindingOutcomes);

  let staff = await client.query(
    `select id,staff_code,legacy_staff_id,display_name,employment_type,default_work_area,hourly_rate,active
     from public.staff_members where site_code='fuxing' order by legacy_staff_id`
  );
  assert.equal(staff.rowCount, 2);
  const employeeStaff = staff.rows.find((row) => row.legacy_staff_id === "staff-employee");
  const parttimeStaff = staff.rows.find((row) => row.legacy_staff_id === "staff-parttime");
  assert(employeeStaff);
  assert(parttimeStaff);
  assert.equal(employeeStaff.staff_code, "staff-employee");
  assert.equal(employeeStaff.display_name, "employeefx");
  assert.equal(employeeStaff.employment_type, "other", "generic employee role must not be invented as full-time");
  assert.equal(Number(employeeStaff.hourly_rate), 220);
  assert.equal(parttimeStaff.employment_type, "parttime");
  assert.equal(parttimeStaff.default_work_area, "seafood");

  let binding = await client.query(
    `select user_id,staff_id from public.user_staff_bindings where user_id=$1`,
    [employee.id]
  );
  assert.equal(binding.rowCount, 1, "explicit account username must bind exactly one staff identity");
  assert.equal(String(binding.rows[0].staff_id), String(employeeStaff.id));

  const checkpoint = await client.query(
    `select migration_key,site_code,source_revision,status,rows_read,rows_written,checksum,details
     from public.data_migration_checkpoints
     where migration_key='workforce.staff.v1' and site_code='fuxing'`
  );
  assert.equal(checkpoint.rowCount, 1);
  assert.equal(checkpoint.rows[0].status, "verified");
  assert.equal(Number(checkpoint.rows[0].source_revision), 7);
  assert.equal(Number(checkpoint.rows[0].rows_read), 2);
  assert.equal(Number(checkpoint.rows[0].rows_written), 2);
  assert.match(checkpoint.rows[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(checkpoint.rows[0].details.authority, "business_state");
  assert.deepEqual(checkpoint.rows[0].details.bindingOutcomes, verifyReport.sites[0].bindingOutcomes);
  assert.deepEqual(checkpoint.rows[0].details.bindingMethods, verifyReport.sites[0].bindingMethods);

  const firstIds = new Map(staff.rows.map((row) => [row.legacy_staff_id, String(row.id)]));
  const secondOutput = runBackfill("--apply", "--site=fuxing");
  assert.match(secondOutput, /WORKFORCE_STAFF_BACKFILL_OK/);
  staff = await client.query(
    `select id,legacy_staff_id from public.staff_members where site_code='fuxing' order by legacy_staff_id`
  );
  assert.equal(staff.rowCount, 2, "idempotent rerun must not duplicate staff");
  for (const row of staff.rows) assert.equal(String(row.id), firstIds.get(row.legacy_staff_id), "idempotent rerun changed staff identity");

  binding = await client.query(`select user_id,staff_id from public.user_staff_bindings`);
  assert.equal(binding.rows.filter((row) => String(row.user_id) === String(employee.id)).length, 1, "idempotent rerun duplicated binding");

  const changedModules = structuredClone(modules);
  changedModules.shared.staff[0].hourlyRate = 230;
  await client.query(
    `update public.business_state
     set modules=$2::jsonb,module_revisions=jsonb_set(module_revisions,'{shared}','8'::jsonb),revision=revision+1,updated_at=now()
     where site=$1`,
    ["fuxing", JSON.stringify(changedModules)]
  );
  runBackfill("--apply", "--site=fuxing");
  const changedRate = await client.query(
    `select hourly_rate from public.staff_members where site_code='fuxing' and legacy_staff_id='staff-employee'`
  );
  assert.equal(Number(changedRate.rows[0].hourly_rate), 230, "rerun must refresh mutable staff master fields before authority cutover");
  const changedCheckpoint = await client.query(
    `select source_revision,status from public.data_migration_checkpoints where migration_key='workforce.staff.v1' and site_code='fuxing'`
  );
  assert.equal(Number(changedCheckpoint.rows[0].source_revision), 8);
  assert.equal(changedCheckpoint.rows[0].status, "verified");

  console.log("WORKFORCE_STAFF_BACKFILL_REGRESSION_OK");
} finally {
  await client.end();
}
