const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function text(value) {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function actorName(user) {
  return text(user?.display_name || user?.displayName || user?.username || "user");
}

function endsNextDay(start, end) {
  return TIME_RE.test(start) && TIME_RE.test(end) && end < start;
}

function shiftType(value) {
  const raw = text(value);
  if (raw === "full") return "full_day";
  return ["morning", "evening", "full_day", "custom"].includes(raw) ? raw : null;
}

function canonicalDepartment(site, value, departments, { defaultInside = false } = {}) {
  const raw = text(value) || (defaultInside ? "inside" : "");
  if (site === "central" && raw === "inside" && departments.has("kitchen")) return "kitchen";
  return raw;
}

async function relationalLookups(client, site) {
  const [staff, departments] = await Promise.all([
    client.query(
      `select id,legacy_staff_id from public.staff_members where site_code=$1 and legacy_staff_id is not null`,
      [site]
    ),
    client.query(
      `select code from public.organization_departments where site_code=$1 and active=true`,
      [site]
    ),
  ]);
  return {
    staffByLegacy:new Map(staff.rows.map((row) => [text(row.legacy_staff_id), row.id])),
    departments:new Set(departments.rows.map((row) => text(row.code))),
  };
}

function planSchedule(entry, site, lookups) {
  const legacyId = text(entry?.id);
  const staffLegacyId = text(entry?.staffId);
  const staffId = lookups.staffByLegacy.get(staffLegacyId) || null;
  const date = text(entry?.date);
  const month = text(entry?.month) || date.slice(0, 7);
  const recurring = entry?.applyMode === "month";
  const weekday = Number(entry?.weekday);
  const start = text(entry?.start);
  const end = text(entry?.end);
  const shift = shiftType(entry?.shift);
  const department = canonicalDepartment(site, entry?.department, lookups.departments, { defaultInside:true });
  const errors = [];
  if (!legacyId) errors.push("missing_id");
  if (!staffLegacyId || !staffId) errors.push("staff_unresolved");
  if (!DATE_RE.test(date)) errors.push("invalid_date");
  if (recurring && !MONTH_RE.test(month)) errors.push("invalid_month");
  if (recurring && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) errors.push("invalid_weekday");
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end) errors.push("invalid_time");
  if (!shift) errors.push("invalid_shift");
  if (department && !lookups.departments.has(department)) errors.push("invalid_department");
  return {
    legacyId,
    staffId,
    scheduleKind:recurring ? "recurring" : "date",
    serviceDate:recurring ? null : date,
    recurrenceMonth:recurring ? `${month}-01` : null,
    weekday:recurring ? weekday : null,
    slotNo:1,
    shiftType:shift,
    startTime:start,
    endTime:end,
    endsNextDay:endsNextDay(start, end),
    departmentCode:lookups.departments.has(department) ? department : null,
    workArea:text(entry?.area) || null,
    note:text(entry?.note),
    errors,
  };
}

function collisionErrors(rows) {
  const seen = new Map();
  const collisions = [];
  for (const row of rows.filter((entry) => !entry.errors.length)) {
    const key = row.scheduleKind === "recurring"
      ? `${row.staffId}:recurring:${row.recurrenceMonth}:${row.weekday}:${row.slotNo}`
      : `${row.staffId}:date:${row.serviceDate}:${row.slotNo}`;
    const existing = seen.get(key);
    if (existing) collisions.push({ key, legacyIds:[existing, row.legacyId] });
    else seen.set(key, row.legacyId);
  }
  return collisions;
}

function invalidResult(error, details = null, status = 409) {
  return { ok:false, status, error, details };
}

export async function syncWorkforceScheduleDraftShadow(client, { site, schedules, user }) {
  const lookups = await relationalLookups(client, site);
  const planned = array(schedules).map((entry) => planSchedule(entry, site, lookups));
  const invalid = planned.filter((entry) => entry.errors.length);
  const collisions = collisionErrors(planned);
  if (invalid.length || collisions.length) {
    return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_DRAFT_INVALID", {
      invalid:invalid.map((entry) => ({ id:entry.legacyId, errors:entry.errors })),
      collisions,
    });
  }

  // Deactivate first so slot/date swaps cannot transiently violate unique indexes.
  await client.query(
    `update public.workforce_schedule_entries
     set active=false,updated_by_user_id=$2,updated_at=now()
     where site_code=$1 and active=true`,
    [site, user?.id || null]
  );

  for (const item of planned) {
    await client.query(
      `insert into public.workforce_schedule_entries(
         site_code,staff_id,schedule_kind,service_date,recurrence_month,weekday,slot_no,shift_type,
         start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note,active,source,
         created_by_user_id,updated_by_user_id
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,'manager',$16,$16)
       on conflict (site_code,legacy_schedule_id) where legacy_schedule_id is not null
       do update set staff_id=excluded.staff_id,schedule_kind=excluded.schedule_kind,service_date=excluded.service_date,
         recurrence_month=excluded.recurrence_month,weekday=excluded.weekday,slot_no=excluded.slot_no,
         shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,
         ends_next_day=excluded.ends_next_day,department_code=excluded.department_code,work_area=excluded.work_area,
         note=excluded.note,active=true,source='manager',updated_by_user_id=excluded.updated_by_user_id,updated_at=now()`,
      [site,item.staffId,item.scheduleKind,item.serviceDate,item.recurrenceMonth,item.weekday,item.slotNo,item.shiftType,
        item.startTime,item.endTime,item.endsNextDay,item.departmentCode,item.workArea,item.legacyId,item.note,user?.id || null]
    );
  }

  return { ok:true, rows:planned.length };
}

async function relationalStaffId(client, site, legacyStaffId) {
  const result = await client.query(
    `select id from public.staff_members where site_code=$1 and legacy_staff_id=$2`,
    [site, legacyStaffId]
  );
  return result.rows[0]?.id || null;
}

async function relationalScheduleId(client, site, legacyScheduleId) {
  if (!legacyScheduleId) return null;
  const result = await client.query(
    `select id from public.workforce_schedule_entries where site_code=$1 and legacy_schedule_id=$2`,
    [site, legacyScheduleId]
  );
  return result.rows[0]?.id || null;
}

export async function applyWorkforceScheduleWorkflowShadowMutation(
  client,
  { site, action, after, metadata = {}, user }
) {
  const request = after && typeof after === "object" ? after : null;
  if (!request) return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_REQUEST_INVALID", null, 500);
  const legacyRequestId = text(request.id);
  if (!legacyRequestId) return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_REQUEST_ID_REQUIRED", null, 500);

  if (action === "workforce-schedule-request-create") {
    const staffId = await relationalStaffId(client, site, text(request.staffId));
    if (!staffId) return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_STAFF_REQUIRED");
    const sourceScheduleId = await relationalScheduleId(client, site, text(request.sourceScheduleId));
    if (text(request.sourceScheduleId) && !sourceScheduleId) {
      return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_SOURCE_REQUIRED");
    }
    const requestedStart = text(request.requestedStart) || null;
    const requestedEnd = text(request.requestedEnd) || null;
    await client.query(
      `insert into public.workforce_schedule_requests(
         site_code,staff_id,legacy_request_id,request_type,service_date,source_schedule_entry_id,source_snapshot,
         requested_start_time,requested_end_time,requested_ends_next_day,reason,status,
         created_by_user_id,created_by_name,created_at,updated_at
       ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,'pending',$12,$13,$14,now())`,
      [site,staffId,legacyRequestId,text(request.type),text(request.date),sourceScheduleId,
        request.sourceSnapshot ? JSON.stringify(request.sourceSnapshot) : null,
        requestedStart,requestedEnd,Boolean(requestedStart && requestedEnd && endsNextDay(requestedStart,requestedEnd)),
        text(request.reason),user?.id || null,text(request.createdByName) || actorName(user),request.createdAt]
    );
    return { ok:true, rows:1 };
  }

  const current = await client.query(
    `select id,staff_id,service_date,source_schedule_entry_id from public.workforce_schedule_requests
     where site_code=$1 and legacy_request_id=$2 for update`,
    [site,legacyRequestId]
  );
  if (current.rowCount !== 1) return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_REQUEST_NOT_FOUND");

  if (action === "workforce-schedule-request-cancel") {
    await client.query(
      `update public.workforce_schedule_requests
       set status='cancelled',cancelled_by_user_id=$3,cancelled_by_name=$4,cancelled_at=$5,updated_at=now()
       where site_code=$1 and legacy_request_id=$2`,
      [site,legacyRequestId,user?.id || null,text(request.cancelledByName) || actorName(user),request.cancelledAt]
    );
    return { ok:true, rows:1 };
  }

  if (action === "workforce-schedule-request-reject") {
    await client.query(
      `update public.workforce_schedule_requests
       set status='rejected',decided_by_user_id=$3,decided_by_name=$4,decided_at=$5,decision_note=$6,updated_at=now()
       where site_code=$1 and legacy_request_id=$2`,
      [site,legacyRequestId,user?.id || null,text(request.decidedByName) || actorName(user),request.decidedAt,text(request.decisionNote) || null]
    );
    return { ok:true, rows:1 };
  }

  if (action === "workforce-schedule-request-approve") {
    const exception = metadata?.exception && typeof metadata.exception === "object" ? metadata.exception : null;
    if (!exception || !text(exception.id)) return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_EXCEPTION_REQUIRED", null, 500);
    const lookups = await relationalLookups(client, site);
    const kind = text(exception.kind);
    const department = kind === "override"
      ? canonicalDepartment(site, exception.department, lookups.departments)
      : "";
    if (kind === "override" && (!department || !lookups.departments.has(department))) {
      return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_EXCEPTION_DEPARTMENT_INVALID");
    }
    const sourceScheduleId = await relationalScheduleId(client, site, text(exception.sourceScheduleId));
    if (text(exception.sourceScheduleId) && !sourceScheduleId) {
      return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_SOURCE_REQUIRED");
    }
    await client.query(
      `update public.workforce_schedule_requests
       set status='approved',decided_by_user_id=$3,decided_by_name=$4,decided_at=$5,decision_note=$6,updated_at=now()
       where site_code=$1 and legacy_request_id=$2`,
      [site,legacyRequestId,user?.id || null,text(request.decidedByName) || actorName(user),request.decidedAt,text(request.decisionNote) || null]
    );
    const start = kind === "override" ? text(exception.start) : null;
    const end = kind === "override" ? text(exception.end) : null;
    await client.query(
      `insert into public.workforce_schedule_exceptions(
         site_code,request_id,legacy_exception_id,staff_id,service_date,exception_kind,source_schedule_entry_id,
         start_time,end_time,ends_next_day,department_code,work_area,status,
         approved_by_user_id,approved_by_name,approved_at
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13,$14,$15)`,
      [site,current.rows[0].id,text(exception.id),current.rows[0].staff_id,text(exception.date),kind,sourceScheduleId,
        start,end,Boolean(start && end && endsNextDay(start,end)),kind === "override" ? department : null,
        kind === "override" ? text(exception.area) || null : null,user?.id || null,
        text(exception.approvedByName) || actorName(user),exception.approvedAt]
    );
    return { ok:true, rows:2 };
  }

  return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_ACTION_UNSUPPORTED", { action }, 500);
}

export async function insertWorkforceSchedulePublicationShadow(
  client,
  { site, publication, draftSchedules, user }
) {
  const expectedIds = array(draftSchedules).map((entry) => text(entry?.id));
  if (expectedIds.some((id) => !id) || new Set(expectedIds).size !== expectedIds.length) {
    return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_PUBLICATION_INVALID");
  }
  const current = await client.query(
    `select id,staff_id,schedule_kind,service_date,recurrence_month,weekday,slot_no,shift_type,
            start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note
     from public.workforce_schedule_entries
     where site_code=$1 and active=true
     order by legacy_schedule_id`,
    [site]
  );
  const currentIds = current.rows.map((row) => text(row.legacy_schedule_id));
  if (JSON.stringify([...currentIds].sort()) !== JSON.stringify([...expectedIds].sort())) {
    return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_DRAFT_MISMATCH", { currentIds, expectedIds });
  }
  const version = Number(publication?.version);
  if (!Number.isInteger(version) || version < 1 || Number(publication?.scheduleCount) !== expectedIds.length) {
    return invalidResult("WORKFORCE_SCHEDULE_RELATIONAL_PUBLICATION_INVALID");
  }
  const inserted = await client.query(
    `insert into public.workforce_schedule_publications(
       site_code,version,source_module_revision,schedule_count,published_by_user_id,published_by_name,published_at,metadata
     ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,
    [site,version,Number(publication.sourceModuleRevision),expectedIds.length,user?.id || null,
      text(publication.publishedByName) || actorName(user),publication.publishedAt,
      JSON.stringify({ runtimeShadow:true, compatibilityAuthority:"business_state" })]
  );
  const publicationId = inserted.rows[0].id;
  for (const row of current.rows) {
    await client.query(
      `insert into public.workforce_schedule_publication_entries(
         publication_id,site_code,source_schedule_entry_id,staff_id,schedule_kind,service_date,recurrence_month,
         weekday,slot_no,shift_type,start_time,end_time,ends_next_day,department_code,work_area,legacy_schedule_id,note
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [publicationId,site,row.id,row.staff_id,row.schedule_kind,row.service_date,row.recurrence_month,row.weekday,
        row.slot_no,row.shift_type,row.start_time,row.end_time,row.ends_next_day,row.department_code,row.work_area,
        row.legacy_schedule_id,row.note]
    );
  }
  return { ok:true, publicationId, rows:current.rows.length + 1 };
}
