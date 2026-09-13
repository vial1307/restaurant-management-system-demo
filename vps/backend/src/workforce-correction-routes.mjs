import { randomUUID } from "node:crypto";
import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { isWorkforceSelfServiceUser, resolveWorkforceStaffId } from "./workforce-policy.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);

function text(value) {
  return String(value ?? "").trim();
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

function periodFor(module, month) {
  const period = module?.payroll?.periods?.[month];
  return period && typeof period === "object" && !Array.isArray(period) ? period : null;
}

function canonicalTimestamp(value, { optional = false } = {}) {
  if ((value === null || value === undefined || text(value) === "") && optional) return null;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function attendanceFacts(entry = {}) {
  return {
    clockIn:text(entry.clockIn),
    clockOut:entry.clockOut ? text(entry.clockOut) : null,
    breakMinutes:Math.max(0, Number(entry.breakMinutes) || 0),
    note:text(entry.note),
  };
}

function canonicalCorrection(input = {}) {
  const clockIn = canonicalTimestamp(input.clockIn);
  const clockOut = canonicalTimestamp(input.clockOut, { optional:true });
  const breakMinutes = Number(input.breakMinutes);
  const note = text(input.note);
  if (!clockIn) return { ok:false, error:"WORKFORCE_CORRECTION_CLOCK_IN_INVALID" };
  if (input.clockOut && !clockOut) return { ok:false, error:"WORKFORCE_CORRECTION_CLOCK_OUT_INVALID" };
  if (clockOut && Date.parse(clockOut) < Date.parse(clockIn)) {
    return { ok:false, error:"WORKFORCE_CORRECTION_TIME_ORDER_INVALID" };
  }
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    return { ok:false, error:"WORKFORCE_CORRECTION_BREAK_INVALID" };
  }
  return {
    ok:true,
    value:{ clockIn, clockOut, breakMinutes, note },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

function jsonEqual(left, right) {
  try { return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right)); }
  catch { return false; }
}

function changedFields(before, after) {
  return Object.keys(after).filter((key) => !jsonEqual(before?.[key], after?.[key]));
}

function clearApproval(entry) {
  delete entry.approvalStatus;
  delete entry.approvedAt;
  delete entry.approvedByUserId;
  delete entry.approvedByName;
}

function requestPayload(request) {
  return request ? structuredClone(request) : null;
}

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
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
    if (!result?.ok) return result || { ok:false, status:400, error:"WORKFORCE_CORRECTION_INVALID" };

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
       ) values($1,$2,$3,'attendance_correction',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
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

function respondMutation(reply, result) {
  if (!result.ok) return reply.code(result.status || 400).send({ error:result.error || "WORKFORCE_CORRECTION_INVALID" });
  return reply.send({
    ok:true,
    unchanged:Boolean(result.unchanged),
    moduleRevision:result.moduleRevision,
    revision:result.revision,
    updatedAt:result.updatedAt,
    correctionRequest:result.payload,
  });
}

export async function registerWorkforceCorrectionRoutes(app) {
  app.post("/api/workforce/:site/attendance-corrections", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnCorrection(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });

    const attendanceId = text(request.body?.attendanceId);
    const reason = text(request.body?.reason);
    if (!attendanceId) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_ATTENDANCE_ID_REQUIRED" });
    if (reason.length < 3) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_REASON_REQUIRED" });
    const corrected = canonicalCorrection(request.body || {});
    if (!corrected.ok) return reply.code(400).send({ error:corrected.error });

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
        if (text(entry.staffId) !== staffId) return { ok:false, status:403, error:"WORKFORCE_CORRECTION_NOT_OWN" };
        if (module.correctionRequests.some((item) => text(item?.attendanceId) === attendanceId && item?.status === "pending")) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_PENDING_EXISTS" };
        }

        const sourceSnapshot = attendanceFacts(entry);
        if (!changedFields(sourceSnapshot, corrected.value).length) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NO_CHANGES" };
        }
        const staff = Array.isArray(modules?.shared?.staff)
          ? modules.shared.staff.find((member) => text(member?.id) === staffId)
          : null;
        const created = {
          id,
          attendanceId,
          staffId,
          staffName:text(entry.staffName || staff?.name),
          date:text(entry.date),
          month:text(entry.date).slice(0, 7),
          sourceSnapshot,
          requested:corrected.value,
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
          metadata:{ attendanceId, staffId, month:created.month, changedFields:changedFields(sourceSnapshot, corrected.value) },
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
    if (!id) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_ID_REQUIRED" });

    const now = new Date().toISOString();
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-cancel",
      entityId:id,
      mutate({ modules, module }) {
        const staffId = resolveWorkforceStaffId(user, modules);
        if (!staffId) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        const correction = module.correctionRequests.find((item) => text(item?.id) === id);
        if (!correction) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (text(correction.staffId) !== staffId || text(correction.createdByUserId) !== String(user.id || "")) {
          return { ok:false, status:403, error:"WORKFORCE_CORRECTION_NOT_OWN" };
        }
        if (correction.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const before = requestPayload(correction);
        correction.status = "cancelled";
        correction.cancelledAt = now;
        return {
          ok:true,
          module,
          before,
          after:requestPayload(correction),
          metadata:{ attendanceId:correction.attendanceId, staffId },
          payload:requestPayload(correction),
        };
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
    if (!id) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_ID_REQUIRED" });

    const now = new Date().toISOString();
    const decidedByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-approve",
      entityId:id,
      mutate({ module }) {
        const correction = module.correctionRequests.find((item) => text(item?.id) === id);
        if (!correction) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (correction.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const entry = module.attendance.find((item) => text(item?.id) === text(correction.attendanceId));
        if (!entry) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_NOT_FOUND" };
        if (text(entry.staffId) !== text(correction.staffId)) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_SOURCE_CHANGED" };
        }
        const month = text(entry.date).slice(0, 7);
        if (periodFor(module, month)?.status === "locked") {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
        }
        if (!jsonEqual(attendanceFacts(entry), correction.sourceSnapshot || {})) {
          return { ok:false, status:409, error:"WORKFORCE_CORRECTION_SOURCE_CHANGED" };
        }
        const corrected = canonicalCorrection(correction.requested || {});
        if (!corrected.ok) return { ok:false, status:409, error:corrected.error };

        const beforeEntry = structuredClone(entry);
        const beforeRequest = requestPayload(correction);
        entry.clockIn = corrected.value.clockIn;
        entry.clockOut = corrected.value.clockOut;
        entry.breakMinutes = corrected.value.breakMinutes;
        entry.note = corrected.value.note;
        clearApproval(entry);

        correction.status = "approved";
        correction.decidedAt = now;
        correction.decidedByUserId = String(user.id || "");
        correction.decidedByName = decidedByName;
        correction.decisionNote = text(request.body?.note);
        const fields = changedFields(attendanceFacts(beforeEntry), attendanceFacts(entry));
        return {
          ok:true,
          module,
          before:{ request:beforeRequest, attendance:beforeEntry },
          after:{ request:requestPayload(correction), attendance:structuredClone(entry) },
          metadata:{ attendanceId:entry.id, staffId:entry.staffId, month, changedFields:fields, approvalInvalidated:true },
          payload:requestPayload(correction),
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
    if (!id) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_ID_REQUIRED" });
    const note = text(request.body?.note);
    if (note.length < 3) return reply.code(400).send({ error:"WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED" });

    const now = new Date().toISOString();
    const decidedByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-reject",
      entityId:id,
      mutate({ module }) {
        const correction = module.correctionRequests.find((item) => text(item?.id) === id);
        if (!correction) return { ok:false, status:404, error:"WORKFORCE_CORRECTION_NOT_FOUND" };
        if (correction.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_CORRECTION_NOT_PENDING" };
        const before = requestPayload(correction);
        correction.status = "rejected";
        correction.decidedAt = now;
        correction.decidedByUserId = String(user.id || "");
        correction.decidedByName = decidedByName;
        correction.decisionNote = note;
        return {
          ok:true,
          module,
          before,
          after:requestPayload(correction),
          metadata:{ attendanceId:correction.attendanceId, staffId:correction.staffId, month:correction.month, decisionNote:note },
          payload:requestPayload(correction),
        };
      },
    });
    return respondMutation(reply, result);
  });
}