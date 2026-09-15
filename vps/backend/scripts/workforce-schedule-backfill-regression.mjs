import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
pg.types.setTypeParser(1082, (value) => value);
const env = { ...process.env };
const client = new Client({
  host:env.DB_HOST || "127.0.0.1",
  port:Number(env.DB_PORT || 5432),
  database:env.POSTGRES_DB || "kitchen_test",
  user:env.POSTGRES_USER || "kitchen_test",
  password:env.POSTGRES_PASSWORD || "kitchen_test",
});

function runBackfill(...args) {
  const result = spawnSync(process.execPath, ["vps/backend/scripts/workforce-schedule-backfill.mjs", ...args], {
    cwd:process.cwd(), env, encoding:"utf8",
  });
  assert.equal(result.status, 0, `schedule backfill failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result.stdout;
}

await client.connect();
try {
  const users = await client.query(
    `select id,username from public.app_users where username in ('managerfx','employeefx','parttimefx') order by username`
  );
  assert.equal(users.rowCount, 3, "regression users missing");
  const manager = users.rows.find((row) => row.username === "managerfx");
  const employee = users.rows.find((row) => row.username === "employeefx");
  const parttime = users.rows.find((row) => row.username === "parttimefx");

  const insertedStaff = await client.query(
    `insert into public.staff_members(site_code,staff_code,legacy_staff_id,display_name,department_code,employment_type,default_work_area,hourly_rate)
     values
       ('fuxing','schedule-employee','schedule-employee','Schedule Employee','inside','parttime','noodles',230),
       ('fuxing','schedule-parttime','schedule-parttime','Schedule Parttime','inside','parttime','soup',225)
     returning id,legacy_staff_id`
  );
  const staff = Object.fromEntries(insertedStaff.rows.map((row) => [row.legacy_staff_id, row.id]));

  const day = {
    id:"schedule-day", staffId:"schedule-employee", staffName:"Schedule Employee",
    department:"inside", area:"noodles", applyMode:"day", date:"2026-10-05", month:"2026-10", weekday:1,
    shift:"evening", start:"17:00", end:"00:30", note:"close kitchen",
  };
  const recurring = {
    id:"schedule-recurring", staffId:"schedule-parttime", staffName:"Schedule Parttime",
    department:"inside", area:"soup", applyMode:"month", date:"2026-10-06", month:"2026-10", weekday:2,
    shift:"full", start:"10:30", end:"00:30", note:"monthly Tuesday",
  };
  const approvedRequest = {
    id:"schedule-request-approved", type:"change", staffId:"schedule-parttime", staffName:"Schedule Parttime",
    date:"2026-10-06", sourceScheduleId:"schedule-recurring", sourceSnapshot:{ ...recurring },
    requestedStart:"18:00", requestedEnd:"00:00", reason:"Class during daytime", status:"approved",
    createdAt:"2026-09-15T08:00:00.000Z", createdByUserId:parttime.id, createdByName:"parttimefx",
    decidedAt:"2026-09-15T09:00:00.000Z", decidedByUserId:manager.id, decidedByName:"managerfx", decisionNote:"ok",
    exceptionId:"schedule-exception-approved",
  };
  const pendingRequest = {
    id:"schedule-request-pending", type:"leave", staffId:"schedule-employee", staffName:"Schedule Employee",
    date:"2026-10-05", sourceScheduleId:"schedule-day", sourceSnapshot:{ ...day }, reason:"Personal leave", status:"pending",
    createdAt:"2026-09-15T10:00:00.000Z", createdByUserId:employee.id, createdByName:"employeefx",
  };
  const exception = {
    id:"schedule-exception-approved", requestId:"schedule-request-approved", staffId:"schedule-parttime", staffName:"Schedule Parttime",
    date:"2026-10-06", kind:"override", sourceScheduleId:"schedule-recurring", start:"18:00", end:"00:00",
    department:"inside", area:"soup", shift:"full", approvedAt:"2026-09-15T09:00:00.000Z",
    approvedByUserId:manager.id, approvedByName:"managerfx",
  };
  const module = {
    schedules:[day, recurring], publishedSchedules:[structuredClone(day), structuredClone(recurring)],
    publication:{
      version:2, publishedAt:"2026-09-15T07:00:00.000Z", publishedByUserId:manager.id,
      publishedByName:"managerfx", scheduleCount:2, sourceModuleRevision:7,
    },
    requests:[pendingRequest, approvedRequest], exceptions:[exception],
  };
  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values('fuxing',$1::jsonb,$2::jsonb,8)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [JSON.stringify({ schedule:module }), JSON.stringify({ schedule:8 })]
  );

  const verify = runBackfill("--site=fuxing");
  assert.match(verify, /WORKFORCE_SCHEDULE_BACKFILL_VERIFY_OK/);
  assert.equal((await client.query(`select count(*)::int as count from public.workforce_schedule_entries where site_code='fuxing'`)).rows[0].count, 0);

  const first = runBackfill("--apply", "--site=fuxing");
  assert.match(first, /WORKFORCE_SCHEDULE_BACKFILL_OK/);
  const schedules = await client.query(
    `select id,staff_id,schedule_kind,service_date,recurrence_month,weekday,shift_type,start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note
     from public.workforce_schedule_entries where site_code='fuxing' order by legacy_schedule_id`
  );
  assert.equal(schedules.rowCount, 2);
  const dayRow = schedules.rows.find((row) => row.legacy_schedule_id === "schedule-day");
  const recurringRow = schedules.rows.find((row) => row.legacy_schedule_id === "schedule-recurring");
  assert.equal(String(dayRow.staff_id), String(staff["schedule-employee"]));
  assert.equal(dayRow.schedule_kind, "date");
  assert.equal(dayRow.note, "close kitchen");
  assert.equal(dayRow.ends_next_day, true);
  assert.equal(recurringRow.schedule_kind, "recurring");
  assert.equal(String(recurringRow.recurrence_month).slice(0, 10), "2026-10-01");
  assert.equal(Number(recurringRow.weekday), 2);
  assert.equal(recurringRow.shift_type, "full_day");
  assert.equal(recurringRow.ends_next_day, true);

  const publication = await client.query(
    `select id,version,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at
     from public.workforce_schedule_publications where site_code='fuxing' and version=2`
  );
  assert.equal(publication.rowCount, 1);
  assert.equal(Number(publication.rows[0].schedule_count), 2);
  assert.equal(String(publication.rows[0].published_by_user_id), String(manager.id));
  assert.equal((await client.query(`select count(*)::int as count from public.workforce_schedule_publication_entries where publication_id=$1`, [publication.rows[0].id])).rows[0].count, 2);

  const requests = await client.query(
    `select id,legacy_request_id,status,request_type,source_schedule_entry_id,requested_ends_next_day
     from public.workforce_schedule_requests where site_code='fuxing' order by legacy_request_id`
  );
  assert.equal(requests.rowCount, 2);
  assert.equal(requests.rows.find((row) => row.legacy_request_id === "schedule-request-approved").status, "approved");
  assert.equal(requests.rows.find((row) => row.legacy_request_id === "schedule-request-approved").requested_ends_next_day, true);
  const exceptionRow = await client.query(
    `select legacy_exception_id,exception_kind,request_id,source_schedule_entry_id,start_time,end_time,ends_next_day,department_code,work_area
     from public.workforce_schedule_exceptions where site_code='fuxing'`
  );
  assert.equal(exceptionRow.rowCount, 1);
  assert.equal(exceptionRow.rows[0].legacy_exception_id, "schedule-exception-approved");
  assert.equal(exceptionRow.rows[0].exception_kind, "override");
  assert.equal(exceptionRow.rows[0].ends_next_day, true);

  const checkpoint = await client.query(
    `select source_revision,status,rows_read,rows_written,checksum,details
     from public.data_migration_checkpoints where migration_key='workforce.schedule.v1' and site_code='fuxing'`
  );
  assert.equal(checkpoint.rowCount, 1);
  assert.equal(Number(checkpoint.rows[0].source_revision), 8);
  assert.equal(checkpoint.rows[0].status, "verified");
  assert.match(checkpoint.rows[0].checksum, /^[a-f0-9]{64}$/);
  assert.equal(Number(checkpoint.rows[0].details.diagnostics.blocking), 0);

  const firstIds = new Map(schedules.rows.map((row) => [row.legacy_schedule_id, String(row.id)]));
  runBackfill("--apply", "--site=fuxing");
  const secondSchedules = await client.query(
    `select id,legacy_schedule_id from public.workforce_schedule_entries where site_code='fuxing' order by legacy_schedule_id`
  );
  assert.equal(secondSchedules.rowCount, 2);
  for (const row of secondSchedules.rows) assert.equal(String(row.id), firstIds.get(row.legacy_schedule_id));
  assert.equal((await client.query(`select count(*)::int as count from public.workforce_schedule_publications where site_code='fuxing'`)).rows[0].count, 1);
  assert.equal((await client.query(`select count(*)::int as count from public.workforce_schedule_publication_entries where publication_id=$1`, [publication.rows[0].id])).rows[0].count, 2);

  const changed = structuredClone(module);
  changed.schedules[0].note = "updated draft note";
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:changed }), JSON.stringify({ schedule:9 })]
  );
  runBackfill("--apply", "--site=fuxing");
  const changedDraft = await client.query(
    `select id,note from public.workforce_schedule_entries where site_code='fuxing' and legacy_schedule_id='schedule-day'`
  );
  assert.equal(String(changedDraft.rows[0].id), firstIds.get("schedule-day"));
  assert.equal(changedDraft.rows[0].note, "updated draft note");
  const publishedNote = await client.query(
    `select note from public.workforce_schedule_publication_entries where publication_id=$1 and legacy_schedule_id='schedule-day'`,
    [publication.rows[0].id]
  );
  assert.equal(publishedNote.rows[0].note, "close kitchen");

  await assert.rejects(
    client.query(`update public.workforce_schedule_publication_entries set note='mutated' where publication_id=$1`, [publication.rows[0].id]),
    (error) => error?.code === "55000"
  );
  console.log("WORKFORCE_SCHEDULE_BACKFILL_REGRESSION_OK");
} finally {
  await client.end();
}
