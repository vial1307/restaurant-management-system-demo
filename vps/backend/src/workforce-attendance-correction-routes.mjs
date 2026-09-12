import { randomUUID } from "node:crypto";
import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { isWorkforceSelfServiceUser, resolveWorkforceStaffId } from "./workforce-policy.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);
const SUPPORTED_FIELDS = new Set(["clockIn", "clockOut", "breakMinutes", "scheduledStart", "note"]);

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

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function attendanceSnapshot(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id:text(entry.id),
    staffId:text(entry.staffId),
    staffName:text(entry.staffName),
    date:text(entry.date),
    clockIn:entry.clockIn || null,
    clockOut:entry.clockOut || null,
    breakMinutes:Number.isFinite(Number(entry.breakMinutes)) ? Number(entry.breakMinutes) : 0,
    scheduledStart:entry.scheduledStart || null,
    hourlyRate:Number.isFinite(Number(entry.hourlyRate)) ? Number(entry.hourlyRate) : 0,
    note:text(entry.note),
    approvalStatus:text(entry.approvalStatus),
    approvedAt:entry.approvedAt || null,
    approvedByUserId:text(entry.approvedByUserId),
    approvedByName:text(entry.approvedByName),
  };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(attendanceSnapshot(left)) === JSON.stringify(attendanceSnapshot(right));
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const normalized = String(value);
  return Number.isFinite(Date.parse(normalized)) ? normalized : undefined;
}

function normalizeChanges(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_CHANGES_INVALID" };
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !SUPPORTED_FIELDS.has(key))) {
    return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_CHANGES_INVALID" };
  }

  const changes = {};
  for (const key of keys) {
    if (key === "breakMinutes") {
      const value = Number(input[key]);
      if (!Number.isInteger(value) || value < 0) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_BREAK_INVALID" };
      changes[key] = value;
      continue;
    }
    if (["clockIn", "clockOut", "scheduledStart"].includes(key)) {
      const value = normalizeTimestamp(input[key]);
      if (value === undefined) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_TIME_INVALID" };
      changes[key] = value;
      continue;
    }
    changes[key] = text(input[key]);
  }
  return { ok:true, changes };
}

function sameCanonicalValue(key, left, right) {
  if (key === "breakMinutes") return Number(left || 0) === Number(right || 0);
  if (["clockIn", "clockOut", "scheduledStart"].includes(key)) return (left || null) === (right || null);
  return text(left) === text(right);
}

function applyChanges(entry, changes) {
  const next = { ...entry };
  for (const [key, value] of Object.entries(changes)) next[key] = value;
  const start = next.clockIn ? Date.parse(String(next.clockIn)) : null;
  const end = next.clockOut ? Date.parse(String(next.clockOut)) : null;
  if (start !== null && !Number.isFinite(start)) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_TIME_INVALID" };
  if (end !== null && !Number.isFinite(end)) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_TIME_INVALID" };
  if (start !== null && end !== null && end < start) return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_RANGE_INVALID" };
  if (next.scheduledStart && !Number.isFinite(Date.parse(String(next.scheduledStart)))) {
    return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_TIME_INVALID" };
  }
  return { ok:true, entry:next };
}

function clearApproval(entry) {
  delete entry.approvalStatus;
  delete entry.approvedAt;
  delete entry.approvedByUserId;
  delete entry.approvedByName;
}

function periodLocked(module, entry) {
  const month = text(entry?.date).slice(0, 7);
  return Boolean(/^\d{4}-\d{2}$/.test(month) && module?.payroll?.periods?.[month]?.status === "locked");
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
      [user.id, user.username, action, entityId, site, auditPayload(result.before), auditPayload(result.after), JSON.stringify(result.metadata || {})]
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

function respond(reply, result) {
  if (!result.ok) return reply.code(result.status || 400).send({ error:result.error || "WORKFORCE_ATTENDANCE_CORRECTION_INVALID" });
  return reply.send({ ok:true, moduleRevision:result.moduleRevision, revision:result.revision, updatedAt:result.updatedAt, request:result.payload });
}

export async function registerWorkforceAttendanceCorrectionRoutes(app) {
  app.post("/api/workforce/:site/attendance-correction-requests", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnCorrection(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });

    const attendanceId = text(request.body?.attendanceId);
    const reason = text(request.body?.reason);
    const normalized = normalizeChanges(request.body?.changes);
    if (!attendanceId) return reply.code(400).send({ error:"WORKFORCE_ATTENDANCE_ID_REQUIRED" });
    if (reason.length < 3) return reply.code(400).send({ error:"WORKFORCE_ATTENDANCE_CORRECTION_REASON_REQUIRED" });
    if (!normalized.ok) return reply.code(400).send({ error:normalized.error });

    const id = `attendance-correction-${randomUUID()}`;
    const now = new Date().toISOString();
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
          return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_CORRECTION_PENDING_EXISTS" };
        }
        const changedEntries = Object.entries(normalized.changes).filter(([key, value]) => !sameCanonicalValue(key, entry?.[key], value));
        if (!changedEntries.length) return { ok:false, status:400, error:"WORKFORCE_ATTENDANCE_CORRECTION_NO_CHANGE" };
        const candidate = applyChanges(entry, Object.fromEntries(changedEntries));
        if (!candidate.ok) return { ok:false, status:400, error:candidate.error };
        const staff = Array.isArray(modules?.shared?.staff)
          ? modules.shared.staff.find((member) => text(member?.id) === staffId)
          : null;
        const created = {
          id,
          attendanceId,
          staffId,
          staffName:text(staff?.name || entry.staffName),
          date:text(entry.date),
          sourceSnapshot:attendanceSnapshot(entry),
          changes:Object.fromEntries(changedEntries),
          reason,
          status:"pending",
          createdAt:now,
          createdByUserId:String(user.id || ""),
          createdByName:actorName(user),
        };
        module.correctionRequests.unshift(created);
        module.correctionRequests = module.correctionRequests.slice(0, 1000);
        return { ok:true, module, before:null, after:structuredClone(created), metadata:{ attendanceId, staffId, date:created.date }, payload:structuredClone(created) };
      },
    });
    return respond(reply, result);
  });

  app.post("/api/workforce/:site/attendance-correction-requests/:id/cancel", async (request, reply) => {
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
        if (!item) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_FOUND" };
        if (text(item.staffId) !== staffId) return { ok:false, status:403, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_OWN" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_PENDING" };
        const before = structuredClone(item);
        item.status = "cancelled";
        item.cancelledAt = now;
        item.cancelledByUserId = String(user.id || "");
        item.cancelledByName = actorName(user);
        return { ok:true, module, before, after:structuredClone(item), metadata:{ attendanceId:item.attendanceId, staffId }, payload:structuredClone(item) };
      },
    });
    return respond(reply, result);
  });

  app.post("/api/workforce/:site/attendance-correction-requests/:id/approve", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageAttendance(user)) return reply.code(403).send({ error:"WORKFORCE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    const now = new Date().toISOString();
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-approve",
      entityId:id,
      mutate({ module }) {
        const item = module.correctionRequests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_PENDING" };
        const entry = module.attendance.find((row) => text(row?.id) === text(item.attendanceId));
        if (!entry) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_NOT_FOUND" };
        if (!snapshotsEqual(entry, item.sourceSnapshot)) return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_CORRECTION_STALE" };
        if (periodLocked(module, entry)) return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
        const applied = applyChanges(entry, item.changes || {});
        if (!applied.ok) return { ok:false, status:400, error:applied.error };

        const before = { request:structuredClone(item), attendance:structuredClone(entry) };
        const targetIndex = module.attendance.findIndex((row) => text(row?.id) === text(item.attendanceId));
        const nextEntry = applied.entry;
        const priorApproval = {
          approvalStatus:text(nextEntry.approvalStatus),
          approvedAt:nextEntry.approvedAt || null,
          approvedByUserId:text(nextEntry.approvedByUserId),
          approvedByName:text(nextEntry.approvedByName),
        };
        clearApproval(nextEntry);
        module.attendance[targetIndex] = nextEntry;
        item.status = "approved";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = actorName(user);
        item.appliedAt = now;
        const after = { request:structuredClone(item), attendance:structuredClone(nextEntry) };
        return {
          ok:true,
          module,
          before,
          after,
          metadata:{ attendanceId:item.attendanceId, staffId:item.staffId, changes:structuredClone(item.changes || {}), priorApproval },
          payload:structuredClone(item),
        };
      },
    });
    return respond(reply, result);
  });

  app.post("/api/workforce/:site/attendance-correction-requests/:id/reject", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageAttendance(user)) return reply.code(403).send({ error:"WORKFORCE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    const note = text(request.body?.note);
    if (note.length < 3) return reply.code(400).send({ error:"WORKFORCE_ATTENDANCE_CORRECTION_REJECT_REASON_REQUIRED" });
    const now = new Date().toISOString();
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-correction-reject",
      entityId:id,
      mutate({ module }) {
        const item = module.correctionRequests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_PENDING" };
        const before = structuredClone(item);
        item.status = "rejected";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = actorName(user);
        item.decisionNote = note;
        return { ok:true, module, before, after:structuredClone(item), metadata:{ attendanceId:item.attendanceId, staffId:item.staffId, note }, payload:structuredClone(item) };
      },
    });
    return respond(reply, result);
  });
}
