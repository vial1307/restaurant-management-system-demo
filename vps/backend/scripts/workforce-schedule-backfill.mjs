import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
pg.types.setTypeParser(1082, (value) => value);
const APPLY = process.argv.includes("--apply");
const SITE_FILTER = (() => {
  const flag = process.argv.find((arg) => arg.startsWith("--site="));
  return flag ? flag.slice("--site=".length).trim() : "";
})();
const MIGRATION_KEY = "workforce.schedule.v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function databaseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.slice(0, 10);
}
function databaseTime(value) {
  const raw = text(value);
  const match = raw.match(/(?:[01]\d|2[0-3]):[0-5]\d/);
  return match ? match[0] : raw.slice(0, 5);
}
function signatureDifferences(actualRows, expectedRows) {
  const actualById = new Map(actualRows.map((row) => [row.legacyId, row]));
  const expectedById = new Map(expectedRows.map((row) => [row.legacyId, row]));
  const ids = [...new Set([...actualById.keys(), ...expectedById.keys()])].sort();
  const result = [];
  for (const legacyId of ids) {
    const actual = actualById.get(legacyId);
    const expected = expectedById.get(legacyId);
    if (!actual || !expected) {
      result.push({ legacyId, fields:[actual ? "missing_expected_row" : "missing_database_row"] });
      continue;
    }
    const fields = [...new Set([...Object.keys(actual), ...Object.keys(expected)])]
      .filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
    if (fields.length) result.push({ legacyId, fields });
  }
  return result.slice(0, 20);
}
function validIso(value) {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}
function uuidOrNull(value, knownUsers) {
  const raw = text(value);
  return UUID_RE.test(raw) && knownUsers.has(raw) ? raw : null;
}
function shiftType(value) {
  const raw = text(value);
  if (raw === "full") return "full_day";
  return ["morning", "evening", "full_day", "custom"].includes(raw) ? raw : null;
}
function canonicalDepartment(site, value, fallback = "") {
  const raw = text(value) || fallback;
  if (site === "central" && raw === "inside") return "kitchen";
  return raw;
}
function endsNextDay(start, end) { return TIME_RE.test(start) && TIME_RE.test(end) && end < start; }
function canonicalSource(site, module, revision) {
  return {
    site, revision,
    schedules:array(module.schedules),
    publishedSchedules:array(module.publishedSchedules),
    publication:object(module.publication),
    requests:array(module.requests),
    exceptions:array(module.exceptions),
  };
}
function checksum(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function scheduleKey(entry) { return text(entry?.id); }

function inspectSchedule(entry, site, staffByLegacy, departments) {
  const legacyId = scheduleKey(entry);
  const staffLegacyId = text(entry?.staffId);
  const staffId = staffByLegacy.get(staffLegacyId) || null;
  const date = text(entry?.date);
  const month = text(entry?.month) || date.slice(0, 7);
  const recurring = entry?.applyMode === "month";
  const weekday = Number(entry?.weekday);
  const start = text(entry?.start);
  const end = text(entry?.end);
  const shift = shiftType(entry?.shift);
  const department = canonicalDepartment(site, entry?.department, "inside");
  const errors = [];
  if (!legacyId) errors.push("missing_id");
  if (!staffLegacyId) errors.push("missing_staff_id");
  else if (!staffId) errors.push("staff_unresolved");
  if (!DATE_RE.test(date)) errors.push("invalid_date");
  if (recurring && !MONTH_RE.test(month)) errors.push("invalid_month");
  if (recurring && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) errors.push("invalid_weekday");
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end) errors.push("invalid_time");
  if (!shift) errors.push("invalid_shift");
  if (department && !departments.has(department)) errors.push("invalid_department");
  return {
    legacyId, staffLegacyId, staffId,
    scheduleKind:recurring ? "recurring" : "date",
    serviceDate:recurring ? null : date,
    recurrenceMonth:recurring ? `${month}-01` : null,
    weekday:recurring ? weekday : null,
    slotNo:1,
    shiftType:shift,
    startTime:start,
    endTime:end,
    endsNextDay:endsNextDay(start, end),
    departmentCode:departments.has(department) ? department : null,
    workArea:text(entry?.area) || null,
    note:text(entry?.note),
    errors,
  };
}

function scheduleCollisionDiagnostics(schedules) {
  const seen = new Map();
  const collisions = [];
  for (const item of schedules.filter((row) => !row.errors.length)) {
    const key = item.scheduleKind === "recurring"
      ? `${item.staffId}:recurring:${item.recurrenceMonth}:${item.weekday}:${item.slotNo}`
      : `${item.staffId}:date:${item.serviceDate}:${item.slotNo}`;
    const existing = seen.get(key);
    if (existing) collisions.push({ key, legacyIds:[existing, item.legacyId] });
    else seen.set(key, item.legacyId);
  }
  return collisions;
}

function sourceSnapshot(request) {
  return request?.sourceSnapshot && typeof request.sourceSnapshot === "object" && !Array.isArray(request.sourceSnapshot)
    ? request.sourceSnapshot : null;
}

function inspectRequest(item, staffByLegacy, scheduleByLegacy, knownUsers) {
  const legacyId = text(item?.id);
  const staffLegacyId = text(item?.staffId);
  const staffId = staffByLegacy.get(staffLegacyId) || null;
  const type = text(item?.type);
  const date = text(item?.date);
  const status = text(item?.status) || "pending";
  const sourceLegacyId = text(item?.sourceScheduleId);
  const requestedStart = text(item?.requestedStart);
  const requestedEnd = text(item?.requestedEnd);
  const errors = [];
  if (!legacyId) errors.push("missing_id");
  if (!staffId) errors.push("staff_unresolved");
  if (!["leave", "change"].includes(type)) errors.push("invalid_type");
  if (!DATE_RE.test(date)) errors.push("invalid_date");
  if (!["pending", "approved", "rejected", "cancelled"].includes(status)) errors.push("invalid_status");
  if (text(item?.reason).length < 1) errors.push("missing_reason");
  if (type === "change" && (!TIME_RE.test(requestedStart) || !TIME_RE.test(requestedEnd) || requestedStart === requestedEnd)) errors.push("invalid_requested_time");
  const createdAt = validIso(item?.createdAt);
  if (!createdAt) errors.push("invalid_created_at");
  const decidedAt = validIso(item?.decidedAt);
  const cancelledAt = validIso(item?.cancelledAt);
  if (["approved", "rejected"].includes(status) && !decidedAt) errors.push("missing_decided_at");
  if (status === "cancelled" && !cancelledAt) errors.push("missing_cancelled_at");
  return {
    legacyId, staffLegacyId, staffId,
    requestType:type,
    serviceDate:date,
    sourceScheduleLegacyId:sourceLegacyId || null,
    sourceSnapshot:sourceSnapshot(item),
    requestedStartTime:type === "change" ? requestedStart : null,
    requestedEndTime:type === "change" ? requestedEnd : null,
    requestedEndsNextDay:type === "change" ? endsNextDay(requestedStart, requestedEnd) : false,
    reason:text(item?.reason), status,
    createdByUserId:uuidOrNull(item?.createdByUserId, knownUsers),
    createdByName:text(item?.createdByName) || text(item?.staffName) || "migration",
    createdAt,
    decidedByUserId:uuidOrNull(item?.decidedByUserId, knownUsers),
    decidedByName:text(item?.decidedByName) || null,
    decidedAt,
    decisionNote:text(item?.decisionNote) || null,
    cancelledByUserId:uuidOrNull(item?.cancelledByUserId, knownUsers),
    cancelledByName:text(item?.cancelledByName) || null,
    cancelledAt,
    errors,
  };
}

function inspectException(item, site, staffByLegacy, requestByLegacy, scheduleByLegacy, knownUsers, departments) {
  const legacyId = text(item?.id);
  const requestLegacyId = text(item?.requestId);
  const staffLegacyId = text(item?.staffId);
  const staffId = staffByLegacy.get(staffLegacyId) || null;
  const requestPlan = requestByLegacy.get(requestLegacyId) || null;
  const kind = text(item?.kind);
  const date = text(item?.date);
  const sourceLegacyId = text(item?.sourceScheduleId);
  const start = text(item?.start);
  const end = text(item?.end);
  const department = canonicalDepartment(site, item?.department);
  const approvedAt = validIso(item?.approvedAt);
  const errors = [];
  if (!legacyId) errors.push("missing_id");
  if (!requestPlan) errors.push("request_unresolved");
  if (!staffId) errors.push("staff_unresolved");
  if (!["leave", "override"].includes(kind)) errors.push("invalid_kind");
  if (!DATE_RE.test(date)) errors.push("invalid_date");
  if (kind === "override" && (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end)) errors.push("invalid_override_time");
  if (kind === "override" && (!department || !departments.has(department))) errors.push("invalid_department");
  if (!approvedAt) errors.push("invalid_approved_at");
  return {
    legacyId, requestLegacyId, staffLegacyId, staffId,
    serviceDate:date,
    exceptionKind:kind,
    sourceScheduleLegacyId:sourceLegacyId || null,
    startTime:kind === "override" ? start : null,
    endTime:kind === "override" ? end : null,
    endsNextDay:kind === "override" ? endsNextDay(start, end) : false,
    departmentCode:kind === "override" && departments.has(department) ? department : null,
    workArea:kind === "override" ? text(item?.area) || null : null,
    approvedByUserId:uuidOrNull(item?.approvedByUserId, knownUsers),
    approvedByName:text(item?.approvedByName) || "migration",
    approvedAt,
    errors,
  };
}

async function loadStaff(client, site) {
  const result = await client.query(`select id,legacy_staff_id from public.staff_members where site_code=$1 and legacy_staff_id is not null`, [site]);
  return new Map(result.rows.map((row) => [text(row.legacy_staff_id), row.id]));
}
async function loadDepartments(client, site) {
  const result = await client.query(`select code from public.organization_departments where site_code=$1 and active=true`, [site]);
  return new Set(result.rows.map((row) => text(row.code)));
}
async function loadUsers(client) {
  const result = await client.query(`select id from public.app_users`);
  return new Set(result.rows.map((row) => text(row.id)));
}

function diagnosticsFor({ schedules, published, requests, exceptions, collisions }) {
  const invalidSchedules = schedules.filter((item) => item.errors.length).map((item) => ({ id:item.legacyId, errors:item.errors }));
  const invalidPublished = published.filter((item) => item.errors.length).map((item) => ({ id:item.legacyId, errors:item.errors }));
  const invalidRequests = requests.filter((item) => item.errors.length).map((item) => ({ id:item.legacyId, errors:item.errors }));
  const invalidExceptions = exceptions.filter((item) => item.errors.length).map((item) => ({ id:item.legacyId, errors:item.errors }));
  return {
    invalidSchedules, invalidPublished, invalidRequests, invalidExceptions, collisions,
    blocking:invalidSchedules.length + invalidPublished.length + invalidRequests.length + invalidExceptions.length + collisions.length,
  };
}

async function inspectSite(client, row, knownUsers) {
  const site = text(row.site);
  const modules = object(row.modules);
  const module = object(modules.schedule);
  const sourceRevision = Number(row.module_revision || 0);
  const staffByLegacy = await loadStaff(client, site);
  const departments = await loadDepartments(client, site);
  const schedules = array(module.schedules).map((entry) => inspectSchedule(entry, site, staffByLegacy, departments));
  const scheduleByLegacy = new Map(schedules.filter((entry) => entry.legacyId).map((entry) => [entry.legacyId, entry]));
  const published = array(module.publishedSchedules).map((entry) => inspectSchedule(entry, site, staffByLegacy, departments));
  const requests = array(module.requests).map((entry) => inspectRequest(entry, staffByLegacy, scheduleByLegacy, knownUsers));
  const requestByLegacy = new Map(requests.filter((entry) => entry.legacyId).map((entry) => [entry.legacyId, entry]));
  const exceptions = array(module.exceptions).map((entry) => inspectException(entry, site, staffByLegacy, requestByLegacy, scheduleByLegacy, knownUsers, departments));
  const collisions = scheduleCollisionDiagnostics(schedules);
  const diagnostics = diagnosticsFor({ schedules, published, requests, exceptions, collisions });
  const source = canonicalSource(site, module, sourceRevision);
  return { site, sourceRevision, module, source, checksum:checksum(source), schedules, scheduleByLegacy, published, requests, exceptions, diagnostics, knownUsers };
}

async function upsertCheckpoint(client, plan, status, rowsWritten, extra = {}) {
  const rowsRead = plan.schedules.length + plan.published.length + plan.requests.length + plan.exceptions.length;
  await client.query(
    `insert into public.data_migration_checkpoints(
       migration_key,site_code,source_revision,status,rows_read,rows_written,checksum,details,started_at,completed_at,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),case when $4 in ('verified','completed','failed') then now() else null end,now())
     on conflict (migration_key,coalesce(site_code,'__global__'))
     do update set source_revision=excluded.source_revision,status=excluded.status,rows_read=excluded.rows_read,
       rows_written=excluded.rows_written,checksum=excluded.checksum,details=excluded.details,
       started_at=coalesce(public.data_migration_checkpoints.started_at,excluded.started_at),
       completed_at=excluded.completed_at,updated_at=now()`,
    [MIGRATION_KEY, plan.site, plan.sourceRevision, status, rowsRead, rowsWritten, plan.checksum,
      JSON.stringify({ authority:"business_state", target:"relational_schedule", diagnostics:plan.diagnostics, ...extra })]
  );
}

async function upsertSchedule(client, site, item) {
  const result = await client.query(
    `insert into public.workforce_schedule_entries(
       site_code,staff_id,schedule_kind,service_date,recurrence_month,weekday,slot_no,shift_type,
       start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note,active,source
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,'migration')
     on conflict (site_code,legacy_schedule_id) where legacy_schedule_id is not null
     do update set staff_id=excluded.staff_id,schedule_kind=excluded.schedule_kind,service_date=excluded.service_date,
       recurrence_month=excluded.recurrence_month,weekday=excluded.weekday,slot_no=excluded.slot_no,
       shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,
       ends_next_day=excluded.ends_next_day,department_code=excluded.department_code,work_area=excluded.work_area,
       note=excluded.note,active=true,updated_at=now()
     returning id`,
    [site,item.staffId,item.scheduleKind,item.serviceDate,item.recurrenceMonth,item.weekday,item.slotNo,item.shiftType,
      item.startTime,item.endTime,item.endsNextDay,item.departmentCode,item.workArea,item.legacyId,item.note]
  );
  return result.rows[0].id;
}

async function upsertPublication(client, plan, scheduleIds) {
  const publication = object(plan.module.publication);
  if (!Object.keys(publication).length || !plan.published.length) return { publicationsWritten:0, publicationEntriesWritten:0 };
  const version = Number(publication.version);
  const publishedAt = validIso(publication.publishedAt);
  if (!Number.isInteger(version) || version < 1 || !publishedAt) throw new Error(`WORKFORCE_SCHEDULE_PUBLICATION_INVALID:${plan.site}`);
  const actor = uuidOrNull(publication.publishedByUserId, plan.knownUsers);
  const sourceModuleRevision = Number(publication.sourceModuleRevision ?? plan.sourceRevision);
  const publishedByName = text(publication.publishedByName) || "migration";
  const existing = await client.query(
    `select id,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at
     from public.workforce_schedule_publications where site_code=$1 and version=$2`, [plan.site, version]
  );
  let publicationId;
  let publicationsWritten = 0;
  let publicationEntriesWritten = 0;
  if (!existing.rowCount) {
    const inserted = await client.query(
      `insert into public.workforce_schedule_publications(
         site_code,version,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at,metadata
       ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,
      [plan.site,version,sourceModuleRevision,plan.published.length,actor,publishedByName,publishedAt,
        JSON.stringify({ migratedFrom:"business_state.schedule.publication" })]
    );
    publicationId = inserted.rows[0].id;
    publicationsWritten = 1;
    for (const item of plan.published) {
      await client.query(
        `insert into public.workforce_schedule_publication_entries(
           publication_id,site_code,source_schedule_entry_id,staff_id,schedule_kind,service_date,recurrence_month,
           weekday,slot_no,shift_type,start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [publicationId,plan.site,scheduleIds.get(item.legacyId) || null,item.staffId,item.scheduleKind,item.serviceDate,item.recurrenceMonth,
          item.weekday,item.slotNo,item.shiftType,item.startTime,item.endTime,item.endsNextDay,item.departmentCode,item.workArea,item.legacyId,item.note]
      );
      publicationEntriesWritten += 1;
    }
  } else {
    const row = existing.rows[0];
    publicationId = row.id;
    const headerMismatch = Number(row.source_module_revision ?? 0) !== Number(sourceModuleRevision ?? 0)
      || Number(row.schedule_count) !== plan.published.length
      || text(row.published_by_user_id) !== text(actor)
      || text(row.published_by_name) !== publishedByName
      || new Date(row.published_at).toISOString() !== new Date(publishedAt).toISOString();
    if (headerMismatch) throw new Error(`WORKFORCE_SCHEDULE_PUBLICATION_PARITY_MISMATCH:${plan.site}:v${version}:header`);
    const entries = await client.query(
      `select staff_id,schedule_kind,service_date,recurrence_month,weekday,slot_no,shift_type,
              start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note
       from public.workforce_schedule_publication_entries where publication_id=$1 order by legacy_schedule_id nulls last,id`,
      [publicationId]
    );
    const dbSignature = entries.rows.map((entry) => ({
      legacyId:text(entry.legacy_schedule_id), staffId:text(entry.staff_id), scheduleKind:text(entry.schedule_kind),
      serviceDate:databaseDate(entry.service_date), recurrenceMonth:databaseDate(entry.recurrence_month),
      weekday:entry.weekday === null ? null : Number(entry.weekday), slotNo:Number(entry.slot_no), shiftType:text(entry.shift_type),
      startTime:databaseTime(entry.start_time), endTime:databaseTime(entry.end_time), endsNextDay:Boolean(entry.ends_next_day),
      departmentCode:text(entry.department_code) || null, workArea:text(entry.work_area) || null, note:text(entry.note),
    })).sort((a,b) => a.legacyId.localeCompare(b.legacyId));
    const expectedSignature = plan.published.map((item) => ({
      legacyId:item.legacyId, staffId:text(item.staffId), scheduleKind:item.scheduleKind,
      serviceDate:item.serviceDate, recurrenceMonth:item.recurrenceMonth, weekday:item.weekday, slotNo:item.slotNo,
      shiftType:item.shiftType, startTime:item.startTime, endTime:item.endTime, endsNextDay:item.endsNextDay,
      departmentCode:item.departmentCode, workArea:item.workArea, note:item.note,
    })).sort((a,b) => a.legacyId.localeCompare(b.legacyId));
    if (JSON.stringify(dbSignature) !== JSON.stringify(expectedSignature)) {
      const differences = signatureDifferences(dbSignature, expectedSignature);
      throw new Error(`WORKFORCE_SCHEDULE_PUBLICATION_PARITY_MISMATCH:${plan.site}:v${version}:entries:${JSON.stringify(differences)}`);
    }
  }
  return { publicationsWritten, publicationEntriesWritten };
}

async function upsertRequest(client, plan, item, scheduleIds) {
  const result = await client.query(
    `insert into public.workforce_schedule_requests(
       site_code,staff_id,legacy_request_id,request_type,service_date,source_schedule_entry_id,source_snapshot,
       requested_start_time,requested_end_time,requested_ends_next_day,reason,status,
       created_by_user_id,created_by_name,created_at,decided_by_user_id,decided_by_name,decided_at,decision_note,
       cancelled_by_user_id,cancelled_by_name,cancelled_at,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now())
     on conflict (site_code,legacy_request_id) where legacy_request_id is not null
     do update set staff_id=excluded.staff_id,request_type=excluded.request_type,service_date=excluded.service_date,
       source_schedule_entry_id=excluded.source_schedule_entry_id,source_snapshot=excluded.source_snapshot,
       requested_start_time=excluded.requested_start_time,requested_end_time=excluded.requested_end_time,
       requested_ends_next_day=excluded.requested_ends_next_day,reason=excluded.reason,status=excluded.status,
       created_by_user_id=excluded.created_by_user_id,created_by_name=excluded.created_by_name,created_at=excluded.created_at,
       decided_by_user_id=excluded.decided_by_user_id,decided_by_name=excluded.decided_by_name,decided_at=excluded.decided_at,
       decision_note=excluded.decision_note,cancelled_by_user_id=excluded.cancelled_by_user_id,
       cancelled_by_name=excluded.cancelled_by_name,cancelled_at=excluded.cancelled_at,updated_at=now()
     returning id`,
    [plan.site,item.staffId,item.legacyId,item.requestType,item.serviceDate,
      item.sourceScheduleLegacyId ? scheduleIds.get(item.sourceScheduleLegacyId) || null : null,
      item.sourceSnapshot ? JSON.stringify(item.sourceSnapshot) : null,item.requestedStartTime,item.requestedEndTime,
      item.requestedEndsNextDay,item.reason,item.status,item.createdByUserId,item.createdByName,item.createdAt,
      item.decidedByUserId,item.decidedByName,item.decidedAt,item.decisionNote,item.cancelledByUserId,item.cancelledByName,item.cancelledAt]
  );
  return result.rows[0].id;
}

async function upsertException(client, plan, item, requestIds, scheduleIds) {
  await client.query(
    `insert into public.workforce_schedule_exceptions(
       site_code,request_id,legacy_exception_id,staff_id,service_date,exception_kind,source_schedule_entry_id,
       start_time,end_time,ends_next_day,department_code,work_area,status,approved_by_user_id,approved_by_name,approved_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$14,$15)
     on conflict (site_code,legacy_exception_id) where legacy_exception_id is not null
     do update set request_id=excluded.request_id,staff_id=excluded.staff_id,service_date=excluded.service_date,
       exception_kind=excluded.exception_kind,source_schedule_entry_id=excluded.source_schedule_entry_id,
       start_time=excluded.start_time,end_time=excluded.end_time,ends_next_day=excluded.ends_next_day,
       department_code=excluded.department_code,work_area=excluded.work_area,status='active',
       approved_by_user_id=excluded.approved_by_user_id,approved_by_name=excluded.approved_by_name,
       approved_at=excluded.approved_at,revoked_by_user_id=null,revoked_by_name=null,revoked_at=null,revoke_reason=null,updated_at=now()`,
    [plan.site,requestIds.get(item.requestLegacyId),item.legacyId,item.staffId,item.serviceDate,item.exceptionKind,
      item.sourceScheduleLegacyId ? scheduleIds.get(item.sourceScheduleLegacyId) || null : null,
      item.startTime,item.endTime,item.endsNextDay,item.departmentCode,item.workArea,item.approvedByUserId,item.approvedByName,item.approvedAt]
  );
}

async function applySite(client, plan) {
  if (plan.diagnostics.blocking) throw new Error(`WORKFORCE_SCHEDULE_BACKFILL_BLOCKED:${plan.site}:${plan.diagnostics.blocking}`);
  const scheduleIds = new Map();
  for (const item of plan.schedules) scheduleIds.set(item.legacyId, await upsertSchedule(client, plan.site, item));
  const publicationResult = await upsertPublication(client, plan, scheduleIds);
  const requestIds = new Map();
  for (const item of plan.requests) requestIds.set(item.legacyId, await upsertRequest(client, plan, item, scheduleIds));
  for (const item of plan.exceptions) await upsertException(client, plan, item, requestIds, scheduleIds);
  const rowsWritten = plan.schedules.length + publicationResult.publicationsWritten + publicationResult.publicationEntriesWritten + plan.requests.length + plan.exceptions.length;
  await upsertCheckpoint(client, plan, "verified", rowsWritten, {
    scheduleRows:plan.schedules.length,
    publicationRows:publicationResult.publicationsWritten,
    publicationEntryRows:publicationResult.publicationEntriesWritten,
    requestRows:plan.requests.length,
    exceptionRows:plan.exceptions.length,
  });
  return { rowsWritten, ...publicationResult, requestsWritten:plan.requests.length, exceptionsWritten:plan.exceptions.length };
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
    `select b.site,b.modules,coalesce((b.module_revisions->>'schedule')::bigint,0) as module_revision
     from public.business_state b
     join public.sites s on s.code=b.site and s.active=true
     where ($1::text='' or b.site=$1)
     order by b.site`, [SITE_FILTER]
  );
  const report = [];
  for (const row of states.rows) {
    const plan = await inspectSite(client, row, knownUsers);
    const summary = {
      site:plan.site,
      sourceRevision:plan.sourceRevision,
      checksum:plan.checksum,
      schedules:plan.schedules.length,
      publishedSchedules:plan.published.length,
      requests:plan.requests.length,
      exceptions:plan.exceptions.length,
      diagnostics:plan.diagnostics,
    };
    if (!APPLY) {
      report.push({ mode:"verify-only", ...summary });
      continue;
    }
    await client.query("begin");
    try {
      await upsertCheckpoint(client, plan, "running", 0);
      const result = await applySite(client, plan);
      await client.query("commit");
      report.push({ mode:"apply", ...summary, ...result });
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log(JSON.stringify({ migrationKey:MIGRATION_KEY, apply:APPLY, sites:report }, null, 2));
  const blocking = report.reduce((sum, item) => sum + Number(item?.diagnostics?.blocking || 0), 0);
  if (!APPLY && blocking) {
    console.log("WORKFORCE_SCHEDULE_BACKFILL_VERIFY_BLOCKED");
    process.exitCode = 2;
  } else {
    console.log(APPLY ? "WORKFORCE_SCHEDULE_BACKFILL_OK" : "WORKFORCE_SCHEDULE_BACKFILL_VERIFY_OK");
  }
} finally {
  await client.end();
}
