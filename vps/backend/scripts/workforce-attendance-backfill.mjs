import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
pg.types.setTypeParser(1082, (value) => value);

const APPLY = process.argv.includes("--apply");
const SITE_FILTER = (() => {
  const flag = process.argv.find((arg) => arg.startsWith("--site="));
  return flag ? flag.slice("--site=".length).trim() : "";
})();
const MIGRATION_KEY = "workforce.attendance.v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validIso(value, { optional = false } = {}) {
  if ((value === null || value === undefined || text(value) === "") && optional) return null;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function uuidOrNull(value, knownUsers) {
  const raw = text(value);
  return UUID_RE.test(raw) && knownUsers.has(raw) ? raw : null;
}

function checksum(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalSource(site, module, revision) {
  return { site, revision, attendance:array(module.attendance) };
}

function scheduledTimestamp(serviceDate, scheduledStart, timezoneName) {
  return scheduledStart ? `${serviceDate} ${scheduledStart}:00 ${timezoneName}` : null;
}

function databaseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function signature(row) {
  return {
    legacyId:text(row.legacyId),
    staffId:text(row.staffId),
    serviceDate:text(row.serviceDate),
    clockInAt:databaseTimestamp(row.clockInAt),
    clockOutAt:databaseTimestamp(row.clockOutAt),
    scheduledStartLocal:row.scheduledStartLocal || null,
    breakMinutes:Number(row.breakMinutes),
    workArea:row.workArea || null,
    hourlyRate:Number(row.hourlyRate),
    currencyCode:text(row.currencyCode),
    note:text(row.note),
    source:text(row.source),
    sourceScheduleEntryId:row.sourceScheduleEntryId ? text(row.sourceScheduleEntryId) : null,
    approvalStatus:text(row.approvalStatus),
    approvedAt:databaseTimestamp(row.approvedAt),
    approvedByUserId:row.approvedByUserId ? text(row.approvedByUserId) : null,
    approvedByName:row.approvedByName || null,
    recordStatus:text(row.recordStatus),
    version:Number(row.version),
  };
}

function signatureDifferences(actualRows, expectedRows) {
  const actualById = new Map(actualRows.map((row) => [row.legacyId, signature(row)]));
  const expectedById = new Map(expectedRows.map((row) => [row.legacyId, signature(row)]));
  const ids = [...new Set([...actualById.keys(), ...expectedById.keys()])].sort();
  const differences = [];
  for (const legacyId of ids) {
    const actual = actualById.get(legacyId);
    const expected = expectedById.get(legacyId);
    if (!actual || !expected) {
      differences.push({ legacyId, fields:[actual ? "unexpected_database_row" : "missing_database_row"] });
      continue;
    }
    const fields = Object.keys(expected).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
    if (fields.length) differences.push({ legacyId, fields });
  }
  return differences.slice(0, 20);
}

async function loadSite(client, site) {
  const result = await client.query(
    `select code,timezone_name,currency_code from public.sites where code=$1 and active=true`,
    [site]
  );
  return result.rows[0] || null;
}

async function loadStaff(client, site) {
  const result = await client.query(
    `select id,legacy_staff_id from public.staff_members where site_code=$1 and legacy_staff_id is not null`,
    [site]
  );
  return new Map(result.rows.map((row) => [text(row.legacy_staff_id), row.id]));
}

async function loadSchedules(client, site) {
  const result = await client.query(
    `select id,legacy_schedule_id,staff_id from public.workforce_schedule_entries
     where site_code=$1 and legacy_schedule_id is not null`,
    [site]
  );
  return new Map(result.rows.map((row) => [text(row.legacy_schedule_id), { id:row.id, staffId:row.staff_id }]));
}

async function loadUsers(client) {
  const result = await client.query(`select id from public.app_users`);
  return new Set(result.rows.map((row) => text(row.id)));
}

function inspectAttendance(entry, { timezoneName, currencyCode, staffByLegacy, scheduleByLegacy, knownUsers }) {
  const legacyId = text(entry?.id);
  const staffLegacyId = text(entry?.staffId);
  const staffId = staffByLegacy.get(staffLegacyId) || null;
  const serviceDate = text(entry?.date);
  const clockInAt = validIso(entry?.clockIn);
  const clockOutAt = validIso(entry?.clockOut, { optional:true });
  const scheduledStart = text(entry?.scheduledStart);
  const breakMinutes = Number(entry?.breakMinutes ?? 0);
  const hourlyRate = Number(entry?.hourlyRate ?? 0);
  const sourceScheduleLegacyId = text(entry?.sourceScheduleId || entry?.sourceScheduleEntryId);
  const sourceSchedule = sourceScheduleLegacyId ? scheduleByLegacy.get(sourceScheduleLegacyId) || null : null;
  const rawApproval = text(entry?.approvalStatus);
  const approvalStatus = rawApproval === "approved" ? "approved" : "pending";
  const approvedAt = approvalStatus === "approved" ? validIso(entry?.approvedAt) : null;
  const approvedByName = approvalStatus === "approved" ? text(entry?.approvedByName) : "";
  const explicitRecordStatus = text(entry?.recordStatus);
  const recordStatus = explicitRecordStatus || "active";
  const rawVersion = Number(entry?.version);
  const version = Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 1;
  const errors = [];

  if (!legacyId) errors.push("missing_id");
  if (!staffLegacyId) errors.push("missing_staff_id");
  else if (!staffId) errors.push("staff_unresolved");
  if (!DATE_RE.test(serviceDate)) errors.push("invalid_date");
  if (!clockInAt) errors.push("invalid_clock_in");
  if (entry?.clockOut && !clockOutAt) errors.push("invalid_clock_out");
  if (clockInAt && clockOutAt && Date.parse(clockOutAt) < Date.parse(clockInAt)) errors.push("invalid_time_order");
  if (scheduledStart && !TIME_RE.test(scheduledStart)) errors.push("invalid_scheduled_start");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) errors.push("invalid_break_minutes");
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) errors.push("invalid_hourly_rate");
  if (rawApproval && !["pending", "approved"].includes(rawApproval)) errors.push("invalid_approval_status");
  if (approvalStatus === "approved" && !clockOutAt) errors.push("approved_open_attendance");
  if (approvalStatus === "approved" && !approvedAt) errors.push("approved_at_missing");
  if (approvalStatus === "approved" && !approvedByName) errors.push("approved_by_name_missing");
  if (!["active", "voided"].includes(recordStatus)) errors.push("invalid_record_status");
  if (sourceScheduleLegacyId && !sourceSchedule) errors.push("schedule_unresolved");
  if (sourceSchedule && staffId && String(sourceSchedule.staffId) !== String(staffId)) errors.push("schedule_staff_mismatch");

  return {
    legacyId,
    staffLegacyId,
    staffId,
    serviceDate,
    clockInAt,
    clockOutAt,
    scheduledStartAt:scheduledStart && DATE_RE.test(serviceDate)
      ? scheduledTimestamp(serviceDate, scheduledStart, timezoneName)
      : null,
    scheduledStartLocal:scheduledStart && DATE_RE.test(serviceDate) ? `${serviceDate} ${scheduledStart}` : null,
    breakMinutes:Number.isInteger(breakMinutes) && breakMinutes >= 0 ? breakMinutes : 0,
    workArea:text(entry?.area) || null,
    hourlyRate:Number.isFinite(hourlyRate) && hourlyRate >= 0 ? hourlyRate : 0,
    currencyCode,
    note:text(entry?.note),
    source:"migration",
    sourceScheduleEntryId:sourceSchedule?.id || null,
    approvalStatus,
    approvedAt,
    approvedByUserId:approvalStatus === "approved" ? uuidOrNull(entry?.approvedByUserId, knownUsers) : null,
    approvedByName:approvalStatus === "approved" ? approvedByName : null,
    recordStatus:["active", "voided"].includes(recordStatus) ? recordStatus : "active",
    version,
    errors,
  };
}

function diagnosticsFor(rows) {
  const invalidRows = rows
    .filter((row) => row.errors.length)
    .map((row) => ({ id:row.legacyId, errors:row.errors }));
  const seenIds = new Map();
  const duplicateIds = [];
  for (const row of rows) {
    if (!row.legacyId) continue;
    const count = (seenIds.get(row.legacyId) || 0) + 1;
    seenIds.set(row.legacyId, count);
    if (count === 2) duplicateIds.push(row.legacyId);
  }
  const openByStaff = new Map();
  const openShiftCollisions = [];
  for (const row of rows.filter((item) => item.staffId && item.recordStatus === "active" && !item.clockOutAt)) {
    const key = String(row.staffId);
    const existing = openByStaff.get(key);
    if (existing) openShiftCollisions.push({ staffLegacyId:row.staffLegacyId, legacyIds:[existing, row.legacyId] });
    else openByStaff.set(key, row.legacyId);
  }
  return {
    invalidRows,
    duplicateIds,
    openShiftCollisions,
    blocking:invalidRows.length + duplicateIds.length + openShiftCollisions.length,
  };
}

async function inspectSite(client, row, knownUsers) {
  const site = text(row.site);
  const siteConfig = await loadSite(client, site);
  if (!siteConfig) throw new Error(`WORKFORCE_ATTENDANCE_SITE_UNRESOLVED:${site}`);
  const modules = object(row.modules);
  const module = object(modules.attendance);
  const sourceRevision = Number(row.module_revision || 0);
  const timezoneName = text(siteConfig.timezone_name) || "Asia/Taipei";
  const currencyCode = text(siteConfig.currency_code) || "TWD";
  const staffByLegacy = await loadStaff(client, site);
  const scheduleByLegacy = await loadSchedules(client, site);
  const rows = array(module.attendance).map((entry) => inspectAttendance(entry, {
    timezoneName,
    currencyCode,
    staffByLegacy,
    scheduleByLegacy,
    knownUsers,
  }));
  return {
    site,
    timezoneName,
    sourceRevision,
    checksum:checksum(canonicalSource(site, module, sourceRevision)),
    rows,
    diagnostics:diagnosticsFor(rows),
  };
}

async function readTargetRows(client, plan) {
  const legacyIds = plan.rows.map((row) => row.legacyId).filter(Boolean);
  if (!legacyIds.length) return [];
  const result = await client.query(
    `select
       legacy_attendance_id as "legacyId",
       staff_id as "staffId",
       service_date as "serviceDate",
       clock_in_at as "clockInAt",
       clock_out_at as "clockOutAt",
       case when scheduled_start_at is null then null
            else to_char(scheduled_start_at at time zone $3, 'YYYY-MM-DD HH24:MI') end as "scheduledStartLocal",
       break_minutes as "breakMinutes",
       work_area as "workArea",
       hourly_rate as "hourlyRate",
       currency_code as "currencyCode",
       note,
       source,
       source_schedule_entry_id as "sourceScheduleEntryId",
       approval_status as "approvalStatus",
       approved_at as "approvedAt",
       approved_by_user_id as "approvedByUserId",
       approved_by_name as "approvedByName",
       record_status as "recordStatus",
       version
     from public.attendance_records
     where site_code=$1 and legacy_attendance_id = any($2::text[])
     order by legacy_attendance_id`,
    [plan.site, legacyIds, plan.timezoneName]
  );
  return result.rows;
}

async function targetOpenConflicts(client, plan) {
  const expectedByStaff = new Map(
    plan.rows
      .filter((row) => row.staffId && row.recordStatus === "active" && !row.clockOutAt)
      .map((row) => [String(row.staffId), row.legacyId])
  );
  if (!expectedByStaff.size) return [];
  const result = await client.query(
    `select staff_id,legacy_attendance_id
     from public.attendance_records
     where site_code=$1 and record_status='active' and clock_out_at is null`,
    [plan.site]
  );
  return result.rows
    .filter((row) => expectedByStaff.has(String(row.staff_id))
      && text(row.legacy_attendance_id) !== expectedByStaff.get(String(row.staff_id)))
    .map((row) => ({
      staffId:String(row.staff_id),
      databaseLegacyId:text(row.legacy_attendance_id),
      expectedLegacyId:expectedByStaff.get(String(row.staff_id)),
    }));
}

async function upsertCheckpoint(client, plan, status, rowsWritten, extra = {}) {
  await client.query(
    `insert into public.data_migration_checkpoints(
       migration_key,site_code,source_revision,status,rows_read,rows_written,checksum,details,
       started_at,completed_at,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),case when $4 in ('verified','completed','failed') then now() else null end,now())
     on conflict (migration_key,coalesce(site_code,'__global__'))
     do update set
       source_revision=excluded.source_revision,
       status=excluded.status,
       rows_read=excluded.rows_read,
       rows_written=excluded.rows_written,
       checksum=excluded.checksum,
       details=excluded.details,
       started_at=coalesce(public.data_migration_checkpoints.started_at,excluded.started_at),
       completed_at=excluded.completed_at,
       updated_at=now()`,
    [
      MIGRATION_KEY,
      plan.site,
      plan.sourceRevision,
      status,
      plan.rows.length,
      rowsWritten,
      plan.checksum,
      JSON.stringify({ authority:"business_state", target:"attendance_records", ...extra }),
    ]
  );
}

async function applySite(client, plan) {
  const targetConflicts = await targetOpenConflicts(client, plan);
  if (targetConflicts.length) {
    throw new Error(`WORKFORCE_ATTENDANCE_TARGET_OPEN_CONFLICT:${plan.site}:${JSON.stringify(targetConflicts)}`);
  }

  let rowsWritten = 0;
  for (const row of plan.rows) {
    await client.query(
      `insert into public.attendance_records(
         site_code,staff_id,legacy_attendance_id,service_date,clock_in_at,clock_out_at,
         scheduled_start_at,break_minutes,work_area,hourly_rate,currency_code,note,source,
         source_schedule_entry_id,approval_status,approved_at,approved_by_user_id,approved_by_name,
         record_status,version
       ) values(
         $1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
       )
       on conflict (site_code,legacy_attendance_id) where legacy_attendance_id is not null
       do update set
         staff_id=excluded.staff_id,
         service_date=excluded.service_date,
         clock_in_at=excluded.clock_in_at,
         clock_out_at=excluded.clock_out_at,
         scheduled_start_at=excluded.scheduled_start_at,
         break_minutes=excluded.break_minutes,
         work_area=excluded.work_area,
         hourly_rate=excluded.hourly_rate,
         currency_code=excluded.currency_code,
         note=excluded.note,
         source=excluded.source,
         source_schedule_entry_id=excluded.source_schedule_entry_id,
         approval_status=excluded.approval_status,
         approved_at=excluded.approved_at,
         approved_by_user_id=excluded.approved_by_user_id,
         approved_by_name=excluded.approved_by_name,
         record_status=excluded.record_status,
         version=excluded.version,
         updated_at=now()`,
      [
        plan.site,
        row.staffId,
        row.legacyId,
        row.serviceDate,
        row.clockInAt,
        row.clockOutAt,
        row.scheduledStartAt,
        row.breakMinutes,
        row.workArea,
        row.hourlyRate,
        row.currencyCode,
        row.note,
        row.source,
        row.sourceScheduleEntryId,
        row.approvalStatus,
        row.approvedAt,
        row.approvedByUserId,
        row.approvedByName,
        row.recordStatus,
        row.version,
      ]
    );
    rowsWritten += 1;
  }

  const actualRows = await readTargetRows(client, plan);
  const differences = signatureDifferences(actualRows, plan.rows);
  if (differences.length) {
    throw new Error(`WORKFORCE_ATTENDANCE_BACKFILL_VERIFY_MISMATCH:${plan.site}:${JSON.stringify(differences)}`);
  }

  await upsertCheckpoint(client, plan, "verified", rowsWritten, {
    targetRows:actualRows.length,
    targetDifferences:[],
  });
  return { rowsWritten, targetRows:actualRows.length };
}

const client = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || process.env.DB_NAME || "kitchen",
  user:process.env.POSTGRES_USER || process.env.DB_USER || "kitchen",
  password:process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || "",
});

await client.connect();
try {
  const knownUsers = await loadUsers(client);
  const states = await client.query(
    `select b.site,b.modules,coalesce((b.module_revisions->>'attendance')::bigint,0) as module_revision
     from public.business_state b
     join public.sites s on s.code=b.site and s.active=true
     where ($1::text='' or b.site=$1)
     order by b.site`,
    [SITE_FILTER]
  );

  const report = [];
  for (const state of states.rows) {
    const plan = await inspectSite(client, state, knownUsers);
    const actualRows = await readTargetRows(client, plan);
    const targetDifferences = signatureDifferences(actualRows, plan.rows);

    if (!APPLY) {
      report.push({
        site:plan.site,
        mode:"verify-only",
        sourceRevision:plan.sourceRevision,
        attendanceRows:plan.rows.length,
        diagnostics:plan.diagnostics,
        relationalRows:actualRows.length,
        relationalMatch:targetDifferences.length === 0 && actualRows.length === plan.rows.length,
        targetDifferences,
        checksum:plan.checksum,
      });
      if (plan.diagnostics.blocking > 0) {
        throw new Error(`WORKFORCE_ATTENDANCE_BACKFILL_BLOCKED:${plan.site}:${JSON.stringify(plan.diagnostics)}`);
      }
      continue;
    }

    if (plan.diagnostics.blocking > 0) {
      throw new Error(`WORKFORCE_ATTENDANCE_BACKFILL_BLOCKED:${plan.site}:${JSON.stringify(plan.diagnostics)}`);
    }

    await client.query("begin");
    try {
      await upsertCheckpoint(client, plan, "running", 0, { diagnostics:plan.diagnostics });
      const result = await applySite(client, plan);
      await client.query("commit");
      report.push({
        site:plan.site,
        mode:"apply",
        sourceRevision:plan.sourceRevision,
        attendanceRows:plan.rows.length,
        diagnostics:plan.diagnostics,
        checksum:plan.checksum,
        ...result,
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log(JSON.stringify({ migrationKey:MIGRATION_KEY, apply:APPLY, sites:report }, null, 2));
  console.log(APPLY ? "WORKFORCE_ATTENDANCE_BACKFILL_OK" : "WORKFORCE_ATTENDANCE_BACKFILL_VERIFY_OK");
} finally {
  await client.end();
}
