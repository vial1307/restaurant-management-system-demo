import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
pg.types.setTypeParser(1082, (value) => value);
const APPLY = process.argv.includes("--apply");
const PARITY = process.argv.includes("--parity");
if (APPLY && PARITY) {
  console.error("WORKFORCE_SCHEDULE_BACKFILL_MODE_CONFLICT");
  process.exit(64);
}
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
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}
function stableJson(value) { return JSON.stringify(stableValue(value)); }
function databaseIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text(value);
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
      result.push({ legacyId, fields:[actual ? "unexpected_database_row" : "missing_database_row"] });
      continue;
    }
    const fields = [...new Set([...Object.keys(actual), ...Object.keys(expected)])]
      .filter((key) => stableJson(actual[key]) !== stableJson(expected[key]));
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
function canonicalLegacyDepartment(site, value, departments, { defaultInside = false } = {}) {
  const raw = text(value) || (defaultInside ? "inside" : "");
  if (site === "central" && raw === "inside" && departments.has("kitchen")) return "kitchen";
  return raw;
}

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
  const department = canonicalLegacyDepartment(site, entry?.department, departments, { defaultInside:true });
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
  const department = canonicalLegacyDepartment(site, item?.department, departments);
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

async function verifyRelationalParity(client, plan) {
  const scheduleRows = await client.query(
    `select id,legacy_schedule_id,staff_id,schedule_kind,service_date,recurrence_month,weekday,slot_no,shift_type,
            start_time,end_time,ends_next_day,department_code,work_area,note
     from public.workforce_schedule_entries
     where site_code=$1 and active=true
     order by legacy_schedule_id nulls last,id`,
    [plan.site]
  );
  const actualSchedules = scheduleRows.rows.map((row) => ({
    legacyId:text(row.legacy_schedule_id) || `__unmapped__:${row.id}`,
    staffId:text(row.staff_id),
    scheduleKind:text(row.schedule_kind),
    serviceDate:databaseDate(row.service_date),
    recurrenceMonth:databaseDate(row.recurrence_month),
    weekday:row.weekday === null ? null : Number(row.weekday),
    slotNo:Number(row.slot_no),
    shiftType:text(row.shift_type),
    startTime:databaseTime(row.start_time),
    endTime:databaseTime(row.end_time),
    endsNextDay:Boolean(row.ends_next_day),
    departmentCode:text(row.department_code) || null,
    workArea:text(row.work_area) || null,
    note:text(row.note),
  }));
  const expectedSchedules = plan.schedules.map((item) => ({
    legacyId:item.legacyId,
    staffId:text(item.staffId),
    scheduleKind:item.scheduleKind,
    serviceDate:item.serviceDate,
    recurrenceMonth:item.recurrenceMonth,
    weekday:item.weekday,
    slotNo:item.slotNo,
    shiftType:item.shiftType,
    startTime:item.startTime,
    endTime:item.endTime,
    endsNextDay:item.endsNextDay,
    departmentCode:item.departmentCode,
    workArea:item.workArea,
    note:item.note,
  }));
  const scheduleDifferences = signatureDifferences(actualSchedules, expectedSchedules);

  const requestRows = await client.query(
    `select r.id,r.legacy_request_id,r.staff_id,r.request_type,r.service_date,s.legacy_schedule_id as source_schedule_legacy_id,
            r.source_snapshot,r.requested_start_time,r.requested_end_time,r.requested_ends_next_day,r.reason,r.status,
            r.created_by_user_id,r.created_by_name,r.created_at,r.decided_by_user_id,r.decided_by_name,r.decided_at,r.decision_note,
            r.cancelled_by_user_id,r.cancelled_by_name,r.cancelled_at
     from public.workforce_schedule_requests r
     left join public.workforce_schedule_entries s on s.id=r.source_schedule_entry_id
     where r.site_code=$1
     order by r.legacy_request_id nulls last,r.id`,
    [plan.site]
  );
  const actualRequests = requestRows.rows.map((row) => ({
    legacyId:text(row.legacy_request_id) || `__unmapped__:${row.id}`,
    staffId:text(row.staff_id),
    requestType:text(row.request_type),
    serviceDate:databaseDate(row.service_date),
    sourceScheduleLegacyId:text(row.source_schedule_legacy_id) || null,
    sourceSnapshot:row.source_snapshot || null,
    requestedStartTime:databaseTime(row.requested_start_time) || null,
    requestedEndTime:databaseTime(row.requested_end_time) || null,
    requestedEndsNextDay:Boolean(row.requested_ends_next_day),
    reason:text(row.reason),
    status:text(row.status),
    createdByUserId:text(row.created_by_user_id) || null,
    createdByName:text(row.created_by_name),
    createdAt:databaseIso(row.created_at),
    decidedByUserId:text(row.decided_by_user_id) || null,
    decidedByName:text(row.decided_by_name) || null,
    decidedAt:databaseIso(row.decided_at),
    decisionNote:text(row.decision_note) || null,
    cancelledByUserId:text(row.cancelled_by_user_id) || null,
    cancelledByName:text(row.cancelled_by_name) || null,
    cancelledAt:databaseIso(row.cancelled_at),
  }));
  const expectedRequests = plan.requests.map((item) => ({
    legacyId:item.legacyId,
    staffId:text(item.staffId),
    requestType:item.requestType,
    serviceDate:item.serviceDate,
    sourceScheduleLegacyId:item.sourceScheduleLegacyId || null,
    sourceSnapshot:item.sourceSnapshot || null,
    requestedStartTime:item.requestedStartTime || null,
    requestedEndTime:item.requestedEndTime || null,
    requestedEndsNextDay:Boolean(item.requestedEndsNextDay),
    reason:item.reason,
    status:item.status,
    createdByUserId:item.createdByUserId || null,
    createdByName:item.createdByName,
    createdAt:databaseIso(item.createdAt),
    decidedByUserId:item.decidedByUserId || null,
    decidedByName:item.decidedByName || null,
    decidedAt:databaseIso(item.decidedAt),
    decisionNote:item.decisionNote || null,
    cancelledByUserId:item.cancelledByUserId || null,
    cancelledByName:item.cancelledByName || null,
    cancelledAt:databaseIso(item.cancelledAt),
  }));
  const requestDifferences = signatureDifferences(actualRequests, expectedRequests);

  const exceptionRows = await client.query(
    `select e.id,e.legacy_exception_id,e.staff_id,e.service_date,e.exception_kind,
            r.legacy_request_id,s.legacy_schedule_id as source_schedule_legacy_id,
            e.start_time,e.end_time,e.ends_next_day,e.department_code,e.work_area,e.status,
            e.approved_by_user_id,e.approved_by_name,e.approved_at
     from public.workforce_schedule_exceptions e
     join public.workforce_schedule_requests r on r.id=e.request_id
     left join public.workforce_schedule_entries s on s.id=e.source_schedule_entry_id
     where e.site_code=$1
     order by e.legacy_exception_id nulls last,e.id`,
    [plan.site]
  );
  const actualExceptions = exceptionRows.rows.map((row) => ({
    legacyId:text(row.legacy_exception_id) || `__unmapped__:${row.id}`,
    requestLegacyId:text(row.legacy_request_id) || null,
    staffId:text(row.staff_id),
    serviceDate:databaseDate(row.service_date),
    exceptionKind:text(row.exception_kind),
    sourceScheduleLegacyId:text(row.source_schedule_legacy_id) || null,
    startTime:databaseTime(row.start_time) || null,
    endTime:databaseTime(row.end_time) || null,
    endsNextDay:Boolean(row.ends_next_day),
    departmentCode:text(row.department_code) || null,
    workArea:text(row.work_area) || null,
    status:text(row.status),
    approvedByUserId:text(row.approved_by_user_id) || null,
    approvedByName:text(row.approved_by_name),
    approvedAt:databaseIso(row.approved_at),
  }));
  const expectedExceptions = plan.exceptions.map((item) => ({
    legacyId:item.legacyId,
    requestLegacyId:item.requestLegacyId || null,
    staffId:text(item.staffId),
    serviceDate:item.serviceDate,
    exceptionKind:item.exceptionKind,
    sourceScheduleLegacyId:item.sourceScheduleLegacyId || null,
    startTime:item.startTime || null,
    endTime:item.endTime || null,
    endsNextDay:Boolean(item.endsNextDay),
    departmentCode:item.departmentCode || null,
    workArea:item.workArea || null,
    status:"active",
    approvedByUserId:item.approvedByUserId || null,
    approvedByName:item.approvedByName,
    approvedAt:databaseIso(item.approvedAt),
  }));
  const exceptionDifferences = signatureDifferences(actualExceptions, expectedExceptions);

  const publication = object(plan.module.publication);
  let publicationParity = { expected:false, ok:true, differences:[] };
  if (Object.keys(publication).length && plan.published.length) {
    const version = Number(publication.version);
    const header = await client.query(
      `select id,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at
       from public.workforce_schedule_publications where site_code=$1 and version=$2`,
      [plan.site,version]
    );
    if (header.rowCount !== 1) {
      publicationParity = { expected:true, ok:false, differences:[{ version, fields:["missing_publication_header"] }] };
    } else {
      const row = header.rows[0];
      const expectedHeader = {
        sourceModuleRevision:Number(publication.sourceModuleRevision ?? plan.sourceRevision),
        scheduleCount:plan.published.length,
        publishedByUserId:uuidOrNull(publication.publishedByUserId, plan.knownUsers),
        publishedByName:text(publication.publishedByName) || "migration",
        publishedAt:databaseIso(publication.publishedAt),
      };
      const actualHeader = {
        sourceModuleRevision:Number(row.source_module_revision ?? 0),
        scheduleCount:Number(row.schedule_count),
        publishedByUserId:text(row.published_by_user_id) || null,
        publishedByName:text(row.published_by_name),
        publishedAt:databaseIso(row.published_at),
      };
      const headerFields = Object.keys(expectedHeader).filter((key) => stableJson(actualHeader[key]) !== stableJson(expectedHeader[key]));
      const entries = await client.query(
        `select pe.id,pe.legacy_schedule_id,pe.staff_id,pe.schedule_kind,pe.service_date,pe.recurrence_month,pe.weekday,pe.slot_no,
                pe.shift_type,pe.start_time,pe.end_time,pe.ends_next_day,pe.department_code,pe.work_area,pe.note
         from public.workforce_schedule_publication_entries pe
         where pe.publication_id=$1
         order by pe.legacy_schedule_id nulls last,pe.id`,
        [row.id]
      );
      const actualEntries = entries.rows.map((entry) => ({
        legacyId:text(entry.legacy_schedule_id) || `__unmapped__:${entry.id}`,
        staffId:text(entry.staff_id),
        scheduleKind:text(entry.schedule_kind),
        serviceDate:databaseDate(entry.service_date),
        recurrenceMonth:databaseDate(entry.recurrence_month),
        weekday:entry.weekday === null ? null : Number(entry.weekday),
        slotNo:Number(entry.slot_no),
        shiftType:text(entry.shift_type),
        startTime:databaseTime(entry.start_time),
        endTime:databaseTime(entry.end_time),
        endsNextDay:Boolean(entry.ends_next_day),
        departmentCode:text(entry.department_code) || null,
        workArea:text(entry.work_area) || null,
        note:text(entry.note),
      }));
      const expectedEntries = plan.published.map((item) => ({
        legacyId:item.legacyId,
        staffId:text(item.staffId),
        scheduleKind:item.scheduleKind,
        serviceDate:item.serviceDate,
        recurrenceMonth:item.recurrenceMonth,
        weekday:item.weekday,
        slotNo:item.slotNo,
        shiftType:item.shiftType,
        startTime:item.startTime,
        endTime:item.endTime,
        endsNextDay:item.endsNextDay,
        departmentCode:item.departmentCode,
        workArea:item.workArea,
        note:item.note,
      }));
      const entryDifferences = signatureDifferences(actualEntries, expectedEntries);
      publicationParity = {
        expected:true,
        ok:headerFields.length === 0 && entryDifferences.length === 0,
        differences:[
          ...(headerFields.length ? [{ version, fields:headerFields }] : []),
          ...entryDifferences,
        ].slice(0,20),
      };
    }
  } else {
    const count = await client.query(
      `select count(*)::int as count from public.workforce_schedule_publications where site_code=$1`,
      [plan.site]
    );
    const historicalCount = Number(count.rows[0]?.count || 0);
    publicationParity = {
      expected:false,
      ok:historicalCount === 0,
      historicalCount,
      differences:historicalCount ? [{ fields:["unexpected_publication_history"] }] : [],
    };
  }

  const checkpointResult = await client.query(
    `select source_revision,status,rows_read,rows_written,checksum,details
     from public.data_migration_checkpoints
     where migration_key=$1 and site_code=$2`,
    [MIGRATION_KEY,plan.site]
  );
  const checkpoint = checkpointResult.rows[0] || null;
  const expectedRowsRead = plan.schedules.length + plan.published.length + plan.requests.length + plan.exceptions.length;
  const relationalRowCount = actualSchedules.length + actualRequests.length + actualExceptions.length
    + Number(publicationParity?.expected ? plan.published.length + 1 : 0);
  const checkpointRequired = expectedRowsRead > 0 || relationalRowCount > 0;
  const checkpointBlocking = [];
  const checkpointWarnings = [];
  if (!checkpoint) {
    if (checkpointRequired) checkpointBlocking.push("missing_checkpoint");
    else checkpointWarnings.push("checkpoint_not_required_for_empty_domain");
  } else {
    if (text(checkpoint.status) !== "verified") checkpointBlocking.push("status");
    if (Number(checkpoint?.details?.diagnostics?.blocking || 0) !== 0) checkpointBlocking.push("blocking_diagnostics");
    if (Number(checkpoint.source_revision) !== Number(plan.sourceRevision)) checkpointWarnings.push("source_revision_stale");
    if (Number(checkpoint.rows_read) !== expectedRowsRead) checkpointWarnings.push("rows_read_stale");
    if (text(checkpoint.checksum) !== plan.checksum) checkpointWarnings.push("checksum_stale");
  }

  const dataParityOk = plan.diagnostics.blocking === 0
    && scheduleDifferences.length === 0
    && requestDifferences.length === 0
    && exceptionDifferences.length === 0
    && publicationParity.ok;
  const ok = dataParityOk && checkpointBlocking.length === 0;

  return {
    ok,
    dataParityOk,
    checkpoint:{
      required:checkpointRequired,
      present:Boolean(checkpoint),
      fresh:Boolean(checkpoint)
        && Number(checkpoint.source_revision) === Number(plan.sourceRevision)
        && Number(checkpoint.rows_read) === expectedRowsRead
        && text(checkpoint.checksum) === plan.checksum,
      sourceRevision:checkpoint ? Number(checkpoint.source_revision) : null,
      status:checkpoint ? text(checkpoint.status) : null,
      rowsRead:checkpoint ? Number(checkpoint.rows_read) : null,
      rowsWritten:checkpoint ? Number(checkpoint.rows_written) : null,
      checksum:checkpoint ? text(checkpoint.checksum) : null,
      blocking:checkpointBlocking,
      warnings:checkpointWarnings,
    },
    relationalCounts:{
      schedules:actualSchedules.length,
      requests:actualRequests.length,
      exceptions:actualExceptions.length,
      publicationExpected:Boolean(publicationParity.expected),
    },
    differences:{
      schedules:scheduleDifferences,
      publication:publicationParity.differences || [],
      requests:requestDifferences,
      exceptions:exceptionDifferences,
    },
  };
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
      if (PARITY) {
        const parity = await verifyRelationalParity(client, plan);
        report.push({ mode:"parity", ...summary, parity });
      } else {
        report.push({ mode:"verify-only", ...summary });
      }
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
  const parityFailed = PARITY && report.some((item) => !item?.parity?.ok);
  if (!APPLY && PARITY && (blocking || parityFailed)) {
    console.log("WORKFORCE_SCHEDULE_PARITY_MISMATCH");
    process.exitCode = 3;
  } else if (!APPLY && blocking) {
    console.log("WORKFORCE_SCHEDULE_BACKFILL_VERIFY_BLOCKED");
    process.exitCode = 2;
  } else {
    console.log(APPLY ? "WORKFORCE_SCHEDULE_BACKFILL_OK" : PARITY ? "WORKFORCE_SCHEDULE_PARITY_OK" : "WORKFORCE_SCHEDULE_BACKFILL_VERIFY_OK");
  }
} finally {
  await client.end();
}