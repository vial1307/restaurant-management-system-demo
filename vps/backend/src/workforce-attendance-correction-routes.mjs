import { randomUUID } from "node:crypto";
import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { isWorkforceSelfServiceUser, resolveWorkforceStaffId } from "./workforce-policy.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);

function text(value) {
  return String(value ?? "").trim();
}

function validTimestamp(value) {
  if (value === null) return false;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed);
}

function actorName(user) {
  return text(user?.display_name || user?.displayName || user?.username || "user");
}

function canManageAttendance(user) {
  return Boolean(
    user
    && ["admin", "manager"].includes(String(user.role || ""))
    && hasPermission(user, "attendance", "edit")
  );
}

function canSubmitOwnCorrection(user) {
  return Boolean(
    user
    && isWorkforceSelfServiceUser(user)
    && hasPermission(user, "attendance", "view")
  );
}

function attendanceModule(modules = {}) {
  const input = modules?.attendance && typeof modules.attendance === "object" && !Array.isArray(modules.attendance)
    ? structuredClone(modules.attendance)
    : {};
  if (!Array.isArray(input.attendance)) input.attendance = [];
  if (!Array.isArray(input.correctionRequests)) input.correctionRequests = [];
  if (!input.payroll || typeof input.payroll !== "object" || Array.isArray(input.payroll)) input.payroll = {};
  if (!input.payroll.periods || typeof input.payroll.periods !== "object" || Array.isArray(input.payroll.periods)) {
    input.payroll.periods = {};
  }
  return input;
}

function currentModuleRevision(revisions = {}) {
  const value = Number(revisions?.attendance);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function attendanceSnapshot(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id:text(entry.id),
    date:text(entry.date),
    staffId:text(entry.staffId),
    staffName:text(entry.staffName),
    area:text(entry.area),
    hourlyRate:Number(entry.hourlyRate) || 0,
    scheduledStart:text(entry.scheduledStart),
    breakMinutes:Number(entry.breakMinutes) || 0,
    clockIn:entry.clockIn || null,
    clockOut:entry.clockOut || null,
    note:text(entry.note),
  };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(attendanceSnapshot(left)) === JSON.stringify(right || null);
}

function periodLocked(module, date) {
  const month = text(date).slice(0, 7);
  return Boolean(month && module?.payroll?.periods?.[month]?.status === "locked");
}

function validCorrectedRange(clockIn, clockOut) {
  if (!validTimestamp(clockIn)) return false;
  if (clockOut === null) return true;
  if (!validTimestamp(clockOut)) return false;
  return Date.parse(String(clockOut)) >= Date.parse(String(clockIn));
}

function requestPayload(value) {
  return value ? structuredClone(value) : null;
}

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
}

async function mutateAttendanceState({ site, user, action, entityId, mutate }) {
  return withTransaction(async (client) => {
    await client.query(
      `insert into public.business_state(site,modules,module_revisions,revision,updated_by)
       values($1,'{}'::jsonb,'{}'::jsonb,0,$2)
       on conflict (site) do nothing`,
      [site, user.id]
    );

    const current = await client.query(
      "select modules,module_revisions,revision from public.business_state where site=$1 for update",
      [site]
    );
    const stored = current.rows[0] || {};
    const modules = stored.modules && typeof stored.modules === "object" ? stored.modules : {};
    const revisions = stored.module_revisions && typeof stored.module_revisions === "object" ? stored.module_revisions : {};
    const module = attendanceModule(modules);
    const result = mutate({ modules, module });
    if (!result?.ok) return result || { ok:false, status:400, error:"WORKFORCE_ATTENDANCE_CORRECTION_INVALID" };

    if (result.unchanged) {
      return {
        ok:true,
        unchanged:true,
        moduleRevision:currentModuleRevision(revisions),
        payload:result.payload || null,
      };
    }

    const nextModules = { ...modules, attendance:result.module };
    const nextModuleRevision = currentModuleRevision(revisions) + 1;
    const nextRevisions = { ...revisions, attendance:nextModuleRevision };
    const saved = await client.query(
      `update public.business_state
       set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=now()
       where site=$1
       returning revision,updated_at`,
      [site, JSON.stringify(nextModules), JSON.stringify(nextRevisions), user.id]
    );

    await client.query(
      `insert into public.audit_logs(
         actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
       ) values($1,$2,$3,'attendance_correction_request',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [
        user.id,
        user.username,
        action,
        entityId,
        site,
        auditPayload(result.before),
        auditPayload(result.after),
        JSON.stringify(result.metadata || {}),
      ]
    );

    return {
      ok:true,
      moduleRevision:nextModuleRevision,
      revision:Number(saved.rows[0]?.revision || 0),
      updatedAt:saved.rows[0]?.updated_at || null,
      payload:result.payload || null,
    };
  });
}

function validateSite(user, site, reply) {
  if (!VALID_SITES.has(site)) {
    reply.code(400).send({ error:"INVALID_SITE" });
    return false;
  }
  if (!siteAllowed(user, site)) {
    reply.code(403).send({ error:"SITE_NOT_ALLOWED" });
    return false;
  }
  return true;
}

function respondMutation(reply, result) {
  if (!result.ok) return reply.code(result.status || 400).send({ error:result.error || "WORKFORCE_ATTENDANCE_CORRECTION_INVALID" });
  return reply.send({
    ok:true,
    unchanged:Boolean(result.unchanged),
    moduleRevision:result.moduleRevision,
    revision:result.revision,
    updatedAt:result.updatedAt,
    request:result.payload,
  });
}

export async function registerWorkforceAttendanceCorrectionRoutes(app) {
  app.post("/api/workforce/:site/attendance-corrections", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnCorrection(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });

    const attendanceId = text(request.body?.attendanceId);
    const reason = text(request.body?.reason);
    const requestedClockIn = request.body?.requestedClockIn === null ? null : text(request.body?.requestedClockIn);
    const requestedClockOut = request.body?.requestedClockOut === null ? null : text(request.body?.requestedClockOut);
    if (!attendanceId) return reply.code(400).send({ error:"WORKFORCE_ATTENDANCE_ID_REQUIRED" });
    if (reason.length < 3) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_REASON_REQUIRED" });
    if (!validCorrectedRange(requestedClockIn, requestedClockOut)) {
      return reply.code(400).send({ error:"WORKFORCE_CORRECTION_TIME_INVALID" });
    }

    const id = `attendance-correction-${randomUUID()}`;
    const now = new Date().toISOString();
    const createdByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-create",
      entityId:id,
      mutate({ modules, module }) {
        const staffId = resolveWorkforceStaffId(user, modules);
        if (!staffId) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        const entry = module.attendance.find((item) => text(item?.id) === attendanceId);
        if (!entry) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_NOT_FOUND" };
        if (text(entry.staffId) !== staffId) return { ok:false, status:403, error:"WORKFORCE_ATTENDANCE_NOT_OWN" };
        if (module.correctionRequests.some((item) => text(item?.attendanceId) === attendanceId && item?.status === "pending")) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_PENDING_EXISTS" };
        }
        if (requestedClockIn === entry.clockIn && requestedClockOut === (entry.clockOut ?? null)) {
          return { ok:false, status:400, error:"WORKFORCE_CORRECTION_NO_CHANGE" };
        }

        const created = {
          id,
          attendanceId,
          staffId,
          staffName:text(entry.staffName),
          date:text(entry.date),
          sourceSnapshot:attendanceSnapshot(entry),
          requestedClockIn,
          requestedClockOut,
          reason,
          status:"pending",
          createdAt:now,
          createdByUserId:String(user.id || ""),
          createdByName,
        };
        module.correctionRequests.unshift(created);
        module.correctionRequests = module.correctionRequests.slice(0, 1000);
        return {
          ok:true,
          module,
          before:null,
          after:requestPayload(created),
          metadata:{ attendanceId, staffId, date:created.date },
          payload:requestPayload(created),
        };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/attendance-corrections/:id/cancel", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnCorrection(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });
    const id = text(request.params.id);

    const now = new Date().toISOString();
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-cancel",
      entityId:id,
      mutate({ modules, module }) {
        const staffId = resolveWorkforceStaffId(user, modules);
        if (!staffId) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        const item = module.correctionRequests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (text(item.staffId) !== staffId) return { ok:false, status:403, error:"WORKFORCE_CORRECTION_NOT_OWN" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const before = requestPayload(item);
        item.status = "cancelled";
        item.cancelledAt = now;
        item.cancelledByUserId = String(user.id || "");
        item.cancelledByName = actorName(user);
        return { ok:true, module, before, after:requestPayload(item), metadata:{ attendanceId:item.attendanceId, staffId }, payload:requestPayload(item) };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/attendance-corrections/:id/approve", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageAttendance(user)) return reply.code(403).send({ error:"WORKFORCE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    const now = new Date().toISOString();
    const decidedByName = actorName(user);

    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-approve",
      entityId:id,
      mutate({ module }) {
        const item = module.correctionRequests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const entry = module.attendance.find((candidate) => text(candidate?.id) === text(item.attendanceId));
        if (!entry) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_NOT_FOUND" };
        if (!snapshotsEqual(entry, item.sourceSnapshot)) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_SOURCE_CHANGED" };
        }
        if (periodLocked(module, entry.date)) {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
        }
        if (!validCorrectedRange(item.requestedClockIn, item.requestedClockOut)) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_TIME_INVALID" };
        }

        const before = requestPayload(item);
        entry.clockIn = item.requestedClockIn;
        entry.clockOut = item.requestedClockOut;
        delete entry.approvalStatus;
        delete entry.approvedAt;
        delete entry.approvedByUserId;
        delete entry.approvedByName;
        entry.lastCorrectionRequestId = id;
        entry.correctedAt = now;
        entry.correctedByUserId = String(user.id || "");
        entry.correctedByName = decidedByName;

        item.status = "approved";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = decidedByName;
        item.decisionNote = text(request.body?.note);
        return {
          ok:true,
          module,
          before,
          after:requestPayload(item),
          metadata:{ attendanceId:item.attendanceId, staffId:item.staffId, date:item.date },
          payload:requestPayload(item),
        };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/attendance-corrections/:id/reject", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageAttendance(user)) return reply.code(403).send({ error:"WORKFORCE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    const note = text(request.body?.note);
    if (note.length < 3) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED" });

    const now = new Date().toISOString();
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-reject",
      entityId:id,
      mutate({ module }) {
        const item = module.correctionRequests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const before = requestPayload(item);
        item.status = "rejected";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = actorName(user);
        item.decisionNote = note;
        return { ok:true, module, before, after:requestPayload(item), metadata:{ attendanceId:item.attendanceId, staffId:item.staffId }, payload:requestPayload(item) };
      },
    });
    return respondMutation(reply, result);
  });
}
