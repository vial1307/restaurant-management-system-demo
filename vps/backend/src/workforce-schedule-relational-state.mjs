function text(value) {
  return String(value ?? "").trim();
}

function databaseDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.slice(0, 10);
}

function databaseTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = text(value);
  const match = raw.match(/(?:[01]\d|2[0-3]):[0-5]\d/);
  return match ? match[0] : raw.slice(0, 5);
}

function databaseIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text(value);
}

function legacyDepartment(value) {
  return text(value) === "outside" ? "outside" : "inside";
}

function legacyShift(value) {
  const shift = text(value);
  return shift === "full_day" ? "full" : shift;
}

function recurrenceAnchorDate(monthValue, weekdayValue) {
  const monthDate = databaseDate(monthValue);
  if (!/^\d{4}-\d{2}-01$/.test(monthDate)) return "";
  const weekday = Number(weekdayValue);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "";
  const first = new Date(`${monthDate}T12:00:00Z`);
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  first.setUTCDate(first.getUTCDate() + delta);
  return first.toISOString().slice(0, 10);
}

function compatibilitySchedule(row) {
  const recurring = text(row.schedule_kind) === "recurring";
  const recurrenceMonth = databaseDate(row.recurrence_month);
  const serviceDate = databaseDate(row.service_date);
  const weekday = recurring
    ? Number(row.weekday)
    : serviceDate ? new Date(`${serviceDate}T12:00:00Z`).getUTCDay() : null;
  const date = recurring ? recurrenceAnchorDate(recurrenceMonth, weekday) : serviceDate;
  const id = text(row.legacy_schedule_id) || text(row.id);
  return {
    id,
    staffId:text(row.legacy_staff_id) || text(row.staff_id),
    staffName:text(row.display_name),
    department:legacyDepartment(row.department_code),
    area:text(row.work_area),
    applyMode:recurring ? "month" : "day",
    date,
    month:(recurring ? recurrenceMonth : serviceDate).slice(0, 7),
    weekday,
    shift:legacyShift(row.shift_type),
    start:databaseTime(row.start_time),
    end:databaseTime(row.end_time),
    note:text(row.note),
  };
}

function compatibilityRequest(row) {
  return {
    id:text(row.legacy_request_id) || text(row.id),
    type:text(row.request_type),
    staffId:text(row.legacy_staff_id) || text(row.staff_id),
    staffName:text(row.display_name),
    date:databaseDate(row.service_date),
    sourceScheduleId:text(row.source_schedule_legacy_id),
    sourceSnapshot:row.source_snapshot && typeof row.source_snapshot === "object" ? row.source_snapshot : null,
    requestedStart:databaseTime(row.requested_start_time),
    requestedEnd:databaseTime(row.requested_end_time),
    reason:text(row.reason),
    status:text(row.status),
    createdAt:databaseIso(row.created_at),
    createdByUserId:text(row.created_by_user_id),
    createdByName:text(row.created_by_name),
    decidedAt:databaseIso(row.decided_at),
    decidedByUserId:text(row.decided_by_user_id),
    decidedByName:text(row.decided_by_name),
    decisionNote:text(row.decision_note),
    cancelledAt:databaseIso(row.cancelled_at),
    cancelledByUserId:text(row.cancelled_by_user_id),
    cancelledByName:text(row.cancelled_by_name),
    exceptionId:text(row.legacy_exception_id),
  };
}

function compatibilityException(row) {
  return {
    id:text(row.legacy_exception_id) || text(row.id),
    requestId:text(row.legacy_request_id) || text(row.request_id),
    staffId:text(row.legacy_staff_id) || text(row.staff_id),
    staffName:text(row.display_name),
    date:databaseDate(row.service_date),
    kind:text(row.exception_kind),
    sourceScheduleId:text(row.source_schedule_legacy_id),
    start:databaseTime(row.start_time),
    end:databaseTime(row.end_time),
    department:text(row.exception_kind) === "override" ? legacyDepartment(row.department_code) : "",
    area:text(row.exception_kind) === "override" ? text(row.work_area) : "",
    shift:text(row.exception_kind) === "override" ? legacyShift(row.source_shift_type) : "",
    approvedAt:databaseIso(row.approved_at),
    approvedByUserId:text(row.approved_by_user_id),
    approvedByName:text(row.approved_by_name),
  };
}

async function loadPublication(client, site) {
  const header = await client.query(
    `select id,version,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at
     from public.workforce_schedule_publications
     where site_code=$1
     order by version desc
     limit 1`,
    [site]
  );
  if (!header.rowCount) return { publication:null, publishedSchedules:[] };
  const row = header.rows[0];
  const entries = await client.query(
    `select pe.id,pe.legacy_schedule_id,pe.staff_id,pe.schedule_kind,pe.service_date,pe.recurrence_month,
            pe.weekday,pe.slot_no,pe.shift_type,pe.start_time,pe.end_time,pe.ends_next_day,
            pe.department_code,pe.work_area,pe.note,
            sm.legacy_staff_id,sm.display_name
     from public.workforce_schedule_publication_entries pe
     join public.staff_members sm on sm.id=pe.staff_id and sm.site_code=pe.site_code
     where pe.publication_id=$1
     order by pe.legacy_schedule_id nulls last,pe.id`,
    [row.id]
  );
  return {
    publication:{
      version:Number(row.version),
      publishedAt:databaseIso(row.published_at),
      publishedByUserId:text(row.published_by_user_id),
      publishedByName:text(row.published_by_name),
      scheduleCount:Number(row.schedule_count || 0),
      sourceModuleRevision:row.source_module_revision === null ? null : Number(row.source_module_revision),
    },
    publishedSchedules:entries.rows.map(compatibilitySchedule),
  };
}

export async function loadWorkforceScheduleRelationalState(client, site) {
  const [compatibility, draft, requests, exceptions, publication] = await Promise.all([
    client.query(
      `select modules,coalesce((module_revisions->>'schedule')::bigint,0) as module_revision
       from public.business_state
       where site=$1`,
      [site]
    ),
    client.query(
      `select e.id,e.legacy_schedule_id,e.staff_id,e.schedule_kind,e.service_date,e.recurrence_month,
              e.weekday,e.slot_no,e.shift_type,e.start_time,e.end_time,e.ends_next_day,
              e.department_code,e.work_area,e.note,
              sm.legacy_staff_id,sm.display_name
       from public.workforce_schedule_entries e
       join public.staff_members sm on sm.id=e.staff_id and sm.site_code=e.site_code
       where e.site_code=$1 and e.active=true
       order by e.legacy_schedule_id nulls last,e.id`,
      [site]
    ),
    client.query(
      `select r.id,r.legacy_request_id,r.staff_id,r.request_type,r.service_date,
              r.source_snapshot,r.requested_start_time,r.requested_end_time,r.reason,r.status,
              r.created_by_user_id,r.created_by_name,r.created_at,
              r.decided_by_user_id,r.decided_by_name,r.decided_at,r.decision_note,
              r.cancelled_by_user_id,r.cancelled_by_name,r.cancelled_at,
              sm.legacy_staff_id,sm.display_name,
              source.legacy_schedule_id as source_schedule_legacy_id,
              ex.legacy_exception_id
       from public.workforce_schedule_requests r
       join public.staff_members sm on sm.id=r.staff_id and sm.site_code=r.site_code
       left join public.workforce_schedule_entries source on source.id=r.source_schedule_entry_id
       left join public.workforce_schedule_exceptions ex on ex.request_id=r.id and ex.status='active'
       where r.site_code=$1
       order by r.created_at desc,r.id`,
      [site]
    ),
    client.query(
      `select e.id,e.legacy_exception_id,e.request_id,e.staff_id,e.service_date,e.exception_kind,
              e.start_time,e.end_time,e.department_code,e.work_area,
              e.approved_by_user_id,e.approved_by_name,e.approved_at,
              sm.legacy_staff_id,sm.display_name,
              r.legacy_request_id,
              source.legacy_schedule_id as source_schedule_legacy_id,
              source.shift_type as source_shift_type
       from public.workforce_schedule_exceptions e
       join public.staff_members sm on sm.id=e.staff_id and sm.site_code=e.site_code
       join public.workforce_schedule_requests r on r.id=e.request_id
       left join public.workforce_schedule_entries source on source.id=e.source_schedule_entry_id
       where e.site_code=$1 and e.status='active'
       order by e.approved_at desc,e.id`,
      [site]
    ),
    loadPublication(client, site),
  ]);

  const modules = compatibility.rows[0]?.modules && typeof compatibility.rows[0].modules === "object"
    ? compatibility.rows[0].modules
    : {};
  const legacySchedule = modules.schedule && typeof modules.schedule === "object" && !Array.isArray(modules.schedule)
    ? modules.schedule
    : {};
  const module = {
    schedules:draft.rows.map(compatibilitySchedule),
    requests:requests.rows.map(compatibilityRequest),
    exceptions:exceptions.rows.map(compatibilityException),
  };
  if (legacySchedule.rules && typeof legacySchedule.rules === "object" && !Array.isArray(legacySchedule.rules)) {
    module.rules = structuredClone(legacySchedule.rules);
  }
  if (publication.publication) {
    module.publication = publication.publication;
    module.publishedSchedules = publication.publishedSchedules;
  }

  return {
    site,
    authority:"relational-shadow",
    module,
    identityModules:{
      shared:modules.shared && typeof modules.shared === "object" ? structuredClone(modules.shared) : {},
      schedule:module,
    },
    compatibilityModuleRevision:Number(compatibility.rows[0]?.module_revision || 0),
    counts:{
      schedules:module.schedules.length,
      publishedSchedules:publication.publishedSchedules.length,
      requests:module.requests.length,
      exceptions:module.exceptions.length,
    },
  };
}
