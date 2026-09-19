import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadWorkforceScheduleRelationalState } from "../src/workforce-schedule-relational-state.mjs";
import {
  applyWorkforceScheduleWorkflowShadowMutation,
  insertWorkforceSchedulePublicationShadow,
  syncWorkforceScheduleDraftShadow,
} from "../src/workforce-schedule-relational-shadow.mjs";

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

  const relationalState = await loadWorkforceScheduleRelationalState(client, "fuxing");
  assert.equal(relationalState.authority, "relational-shadow");
  assert.equal(relationalState.module.schedules.length, 2);
  assert.equal(relationalState.module.publishedSchedules.length, 2);
  assert.equal(relationalState.module.requests.length, 2);
  assert.equal(relationalState.module.exceptions.length, 1);
  const projectedDay = relationalState.module.schedules.find((entry) => entry.id === "schedule-day");
  const projectedRecurring = relationalState.module.schedules.find((entry) => entry.id === "schedule-recurring");
  assert.equal(projectedDay.staffId, "schedule-employee");
  assert.equal(projectedDay.applyMode, "day");
  assert.equal(projectedDay.shift, "evening");
  assert.equal(projectedRecurring.staffId, "schedule-parttime");
  assert.equal(projectedRecurring.applyMode, "month");
  assert.equal(projectedRecurring.date, "2026-10-06");
  assert.equal(projectedRecurring.month, "2026-10");
  assert.equal(projectedRecurring.weekday, 2);
  assert.equal(projectedRecurring.shift, "full");
  assert.equal(relationalState.module.publication.version, 2);
  assert.equal(relationalState.module.publication.scheduleCount, 2);
  assert.equal(relationalState.module.requests.find((entry) => entry.id === "schedule-request-approved").status, "approved");
  assert.equal(relationalState.module.exceptions[0].id, "schedule-exception-approved");
  assert.equal(relationalState.module.exceptions[0].shift, "full");
  const firstParity = runBackfill("--parity", "--site=fuxing");
  assert.match(firstParity, /WORKFORCE_SCHEDULE_PARITY_OK/);

  const rulesOnly = structuredClone(module);
  rulesOnly.rules = {
    version:1,
    shifts:{ morning:{ start:"10:00", end:"16:00" }, evening:{ start:"16:00", end:"22:00" }, full:{ start:"10:00", end:"22:00" } },
    staffingBands:[],
  };
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:rulesOnly }), JSON.stringify({ schedule:9 })]
  );
  const staleCheckpointParity = runBackfill("--parity", "--site=fuxing");
  assert.match(staleCheckpointParity, /WORKFORCE_SCHEDULE_PARITY_OK/);
  assert.match(staleCheckpointParity, /"fresh": false/);
  assert.match(staleCheckpointParity, /source_revision_stale/);
  assert.match(staleCheckpointParity, /checksum_stale/);
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
  const changedParity = runBackfill("--parity", "--site=fuxing");
  assert.match(changedParity, /WORKFORCE_SCHEDULE_PARITY_OK/);
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

  const runtimeModule = structuredClone(changed);
  runtimeModule.schedules = [structuredClone(runtimeModule.schedules[0])];
  runtimeModule.schedules[0].note = "runtime shadow draft note";
  const runtimeUser = { id:manager.id, username:manager.username };
  const draftShadow = await syncWorkforceScheduleDraftShadow(client, {
    site:"fuxing",
    schedules:runtimeModule.schedules,
    user:runtimeUser,
  });
  assert.equal(draftShadow.ok, true);
  assert.equal(draftShadow.rows, 1);
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:runtimeModule }), JSON.stringify({ schedule:10 })]
  );
  const runtimeDraftParity = runBackfill("--parity", "--site=fuxing");
  assert.match(runtimeDraftParity, /WORKFORCE_SCHEDULE_PARITY_OK/);
  assert.equal(
    (await client.query(`select count(*)::int as count from public.workforce_schedule_entries where site_code='fuxing' and active=true`)).rows[0].count,
    1
  );
  assert.equal(
    (await client.query(`select active from public.workforce_schedule_entries where site_code='fuxing' and legacy_schedule_id='schedule-recurring'`)).rows[0].active,
    false
  );

  const runtimePublication = {
    version:3,
    publishedAt:"2026-09-16T07:00:00.000Z",
    publishedByUserId:manager.id,
    publishedByName:manager.username,
    scheduleCount:runtimeModule.schedules.length,
    sourceModuleRevision:10,
  };
  const publicationShadow = await insertWorkforceSchedulePublicationShadow(client, {
    site:"fuxing",
    publication:runtimePublication,
    draftSchedules:runtimeModule.schedules,
    user:runtimeUser,
  });
  assert.equal(publicationShadow.ok, true);
  runtimeModule.publishedSchedules = structuredClone(runtimeModule.schedules);
  runtimeModule.publication = runtimePublication;
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:runtimeModule }), JSON.stringify({ schedule:11 })]
  );
  const runtimePublicationParity = runBackfill("--parity", "--site=fuxing");
  assert.match(runtimePublicationParity, /WORKFORCE_SCHEDULE_PARITY_OK/);
  const runtimePublicationRow = await client.query(
    `select id,schedule_count from public.workforce_schedule_publications where site_code='fuxing' and version=3`
  );
  assert.equal(runtimePublicationRow.rowCount, 1);
  assert.equal(Number(runtimePublicationRow.rows[0].schedule_count), 1);
  assert.equal(
    (await client.query(`select count(*)::int as count from public.workforce_schedule_publication_entries where publication_id=$1`, [runtimePublicationRow.rows[0].id])).rows[0].count,
    1
  );

  const runtimeRequest = {
    id:"schedule-request-runtime",
    type:"leave",
    staffId:"schedule-employee",
    staffName:"Schedule Employee",
    date:"2026-10-07",
    sourceScheduleId:"",
    sourceSnapshot:null,
    requestedStart:"",
    requestedEnd:"",
    reason:"Runtime shadow regression",
    status:"pending",
    createdAt:"2026-09-16T08:00:00.000Z",
    createdByUserId:employee.id,
    createdByName:employee.username,
  };
  const requestCreateShadow = await applyWorkforceScheduleWorkflowShadowMutation(client, {
    site:"fuxing",
    action:"workforce-schedule-request-create",
    after:runtimeRequest,
    metadata:{},
    user:{ id:employee.id, username:employee.username },
  });
  assert.equal(requestCreateShadow.ok, true);
  runtimeModule.requests.unshift(structuredClone(runtimeRequest));
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:runtimeModule }), JSON.stringify({ schedule:12 })]
  );
  assert.match(runBackfill("--parity", "--site=fuxing"), /WORKFORCE_SCHEDULE_PARITY_OK/);

  const runtimeApprovedRequest = {
    ...runtimeRequest,
    status:"approved",
    decidedAt:"2026-09-16T09:00:00.000Z",
    decidedByUserId:manager.id,
    decidedByName:manager.username,
    decisionNote:"approved",
    exceptionId:"schedule-exception-runtime",
  };
  const runtimeException = {
    id:"schedule-exception-runtime",
    requestId:runtimeRequest.id,
    staffId:runtimeRequest.staffId,
    staffName:runtimeRequest.staffName,
    date:runtimeRequest.date,
    kind:"leave",
    sourceScheduleId:"",
    start:"",
    end:"",
    department:"",
    area:"",
    shift:"",
    approvedAt:runtimeApprovedRequest.decidedAt,
    approvedByUserId:manager.id,
    approvedByName:manager.username,
  };
  const requestApproveShadow = await applyWorkforceScheduleWorkflowShadowMutation(client, {
    site:"fuxing",
    action:"workforce-schedule-request-approve",
    after:runtimeApprovedRequest,
    metadata:{ exception:runtimeException },
    user:runtimeUser,
  });
  assert.equal(requestApproveShadow.ok, true);
  runtimeModule.requests = runtimeModule.requests.map((entry) => (
    entry.id === runtimeRequest.id ? structuredClone(runtimeApprovedRequest) : entry
  ));
  runtimeModule.exceptions.unshift(structuredClone(runtimeException));
  await client.query(
    `update public.business_state set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_at=now() where site=$1`,
    ["fuxing", JSON.stringify({ schedule:runtimeModule }), JSON.stringify({ schedule:13 })]
  );
  assert.match(runBackfill("--parity", "--site=fuxing"), /WORKFORCE_SCHEDULE_PARITY_OK/);
  const runtimeRequestRow = await client.query(
    `select status from public.workforce_schedule_requests where site_code='fuxing' and legacy_request_id='schedule-request-runtime'`
  );
  assert.equal(runtimeRequestRow.rows[0].status, "approved");
  const runtimeExceptionRow = await client.query(
    `select exception_kind,status from public.workforce_schedule_exceptions where site_code='fuxing' and legacy_exception_id='schedule-exception-runtime'`
  );
  assert.equal(runtimeExceptionRow.rows[0].exception_kind, "leave");
  assert.equal(runtimeExceptionRow.rows[0].status, "active");

  await client.query(
    `update public.workforce_schedule_entries set note='intentional parity drift' where site_code='fuxing' and legacy_schedule_id='schedule-day'`
  );
  const drift = spawnSync(process.execPath, ["vps/backend/scripts/workforce-schedule-backfill.mjs", "--parity", "--site=fuxing"], {
    cwd:process.cwd(), env, encoding:"utf8",
  });
  assert.equal(drift.status, 3, `parity drift must fail with status 3\nSTDOUT:\n${drift.stdout}\nSTDERR:\n${drift.stderr}`);
  assert.match(drift.stdout, /WORKFORCE_SCHEDULE_PARITY_MISMATCH/);
  assert.match(drift.stdout, /"schedules":\s*\[/);

  await client.query(`delete from public.workforce_schedule_exceptions where site_code='yongji'`);
  await client.query(`delete from public.workforce_schedule_requests where site_code='yongji'`);
  await client.query(`delete from public.workforce_schedule_publication_entries where site_code='yongji'`);
  await client.query(`delete from public.workforce_schedule_publications where site_code='yongji'`);
  await client.query(`delete from public.workforce_schedule_entries where site_code='yongji'`);
  await client.query(`delete from public.data_migration_checkpoints where migration_key='workforce.schedule.v1' and site_code='yongji'`);
  await client.query(
    `insert into public.business_state(site,modules,module_revisions,revision)
     values('yongji',$1::jsonb,$2::jsonb,0)
     on conflict(site) do update set modules=excluded.modules,module_revisions=excluded.module_revisions,revision=excluded.revision,updated_at=now()`,
    [JSON.stringify({ schedule:{ schedules:[], publishedSchedules:[], requests:[], exceptions:[] } }), JSON.stringify({ schedule:0 })]
  );
  const emptyParity = runBackfill("--parity", "--site=yongji");
  assert.match(emptyParity, /WORKFORCE_SCHEDULE_PARITY_OK/);
  assert.match(emptyParity, /checkpoint_not_required_for_empty_domain/);

  console.log("WORKFORCE_SCHEDULE_BACKFILL_REGRESSION_OK");
} finally {
  await client.end();
}
