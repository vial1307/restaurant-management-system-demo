import { randomUUID } from "node:crypto";
import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { isWorkforceSelfServiceUser, resolveWorkforceStaffId } from "./workforce-policy.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);
const VALID_REQUEST_TYPES = new Set(["leave", "change"]);

function text(value) {
  return String(value ?? "").trim();
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(value));
}

function actorName(user) {
  return text(user?.display_name || user?.displayName || user?.username || "user");
}

function canManageSchedule(user) {
  return Boolean(
    user
    && ["admin", "manager"].includes(String(user.role || ""))
    && hasPermission(user, "schedule", "edit")
  );
}

function canSubmitOwnRequest(user) {
  return Boolean(
    user
    && isWorkforceSelfServiceUser(user)
    && hasPermission(user, "schedule", "view")
  );
}

function scheduleModule(modules = {}) {
  const input = modules?.schedule && typeof modules.schedule === "object" && !Array.isArray(modules.schedule)
    ? structuredClone(modules.schedule)
    : {};
  if (!Array.isArray(input.schedules)) input.schedules = [];
  if (!Array.isArray(input.requests)) input.requests = [];
  if (!Array.isArray(input.exceptions)) input.exceptions = [];
  return input;
}

function currentModuleRevision(revisions = {}) {
  const value = Number(revisions?.schedule);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function scheduleSnapshot(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id:text(entry.id),
    date:text(entry.date),
    month:text(entry.month),
    weekday:Number(entry.weekday),
    applyMode:entry.applyMode === "month" ? "month" : "day",
    staffId:text(entry.staffId),
    department:entry.department === "outside" ? "outside" : "inside",
    area:text(entry.area),
    shift:text(entry.shift),
    start:text(entry.start),
    end:text(entry.end),
  };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(scheduleSnapshot(left)) === JSON.stringify(scheduleSnapshot(right));
}

function baseScheduleResolution(module, staffId, date) {
  const schedules = module.schedules.filter((entry) => text(entry?.staffId) === staffId);
  const day = schedules.filter((entry) => entry?.applyMode !== "month" && text(entry?.date) === date);
  if (day.length > 1) return { ambiguous:true, schedule:null };
  if (day.length === 1) return { ambiguous:false, schedule:day[0] };

  const month = date.slice(0, 7);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const recurring = schedules.filter((entry) => (
    entry?.applyMode === "month"
    && text(entry?.month) === month
    && Number(entry?.weekday) === weekday
  ));
  if (recurring.length > 1) return { ambiguous:true, schedule:null };
  return { ambiguous:false, schedule:recurring[0] || null };
}

function requestPayload(request) {
  return request ? structuredClone(request) : null;
}

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
}

async function mutateScheduleState({ site, user, action, entityId, mutate }) {
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
    const module = scheduleModule(modules);
    const result = mutate({ modules, module });
    if (!result?.ok) return result || { ok:false, status:400, error:"WORKFORCE_REQUEST_INVALID" };

    if (result.unchanged) {
      return {
        ok:true,
        unchanged:true,
        moduleRevision:currentModuleRevision(revisions),
        payload:result.payload || null,
      };
    }

    const nextModules = { ...modules, schedule:result.module };
    const nextModuleRevision = currentModuleRevision(revisions) + 1;
    const nextRevisions = { ...revisions, schedule:nextModuleRevision };
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
       ) values($1,$2,$3,'schedule_request',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
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
  if (!result.ok) return reply.code(result.status || 400).send({ error:result.error || "WORKFORCE_REQUEST_INVALID" });
  return reply.send({
    ok:true,
    unchanged:Boolean(result.unchanged),
    moduleRevision:result.moduleRevision,
    revision:result.revision,
    updatedAt:result.updatedAt,
    request:result.payload,
  });
}

export async function registerWorkforceRequestRoutes(app) {
  app.post("/api/workforce/:site/schedule-requests", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnRequest(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });

    const type = text(request.body?.type);
    const date = text(request.body?.date);
    const reason = text(request.body?.reason);
    const requestedStart = text(request.body?.requestedStart);
    const requestedEnd = text(request.body?.requestedEnd);
    if (!VALID_REQUEST_TYPES.has(type)) return reply.code(400).send({ error:"WORKFORCE_REQUEST_TYPE_INVALID" });
    if (!validDate(date)) return reply.code(400).send({ error:"WORKFORCE_REQUEST_DATE_INVALID" });
    if (reason.length < 3) return reply.code(400).send({ error:"WORKFORCE_REQUEST_REASON_REQUIRED" });
    if (type === "change" && (!validTime(requestedStart) || !validTime(requestedEnd) || requestedStart === requestedEnd)) {
      return reply.code(400).send({ error:"WORKFORCE_REQUEST_TIME_INVALID" });
    }

    const id = `schedule-request-${randomUUID()}`;
    const now = new Date().toISOString();
    const createdByName = actorName(user);
    const result = await mutateScheduleState({
      site,
      user,
      action:"workforce-schedule-request-create",
      entityId:id,
      mutate({ modules, module }) {
        const staffId = resolveWorkforceStaffId(user, modules);
        if (!staffId) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        const staff = Array.isArray(modules?.shared?.staff)
          ? modules.shared.staff.find((entry) => text(entry?.id) === staffId)
          : null;
        if (!staff) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        if (module.requests.some((entry) => text(entry?.staffId) === staffId && text(entry?.date) === date && entry?.status === "pending")) {
          return { ok:false, status:409, error:"WORKFORCE_REQUEST_PENDING_EXISTS" };
        }

        const source = baseScheduleResolution(module, staffId, date);
        if (source.ambiguous) return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_AMBIGUOUS" };
        if (type === "change" && !source.schedule) {
          return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_REQUIRED" };
        }

        const created = {
          id,
          type,
          staffId,
          staffName:text(staff.name),
          date,
          sourceScheduleId:text(source.schedule?.id),
          sourceSnapshot:source.schedule ? scheduleSnapshot(source.schedule) : null,
          requestedStart:type === "change" ? requestedStart : "",
          requestedEnd:type === "change" ? requestedEnd : "",
          reason,
          status:"pending",
          createdAt:now,
          createdByUserId:String(user.id || ""),
          createdByName,
        };
        module.requests.unshift(created);
        module.requests = module.requests.slice(0, 1000);
        return {
          ok:true,
          module,
          before:null,
          after:requestPayload(created),
          metadata:{ type, date, staffId, sourceScheduleId:created.sourceScheduleId || null },
          payload:requestPayload(created),
        };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/schedule-requests/:id/cancel", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canSubmitOwnRequest(user)) return reply.code(403).send({ error:"WORKFORCE_SELF_SERVICE_REQUIRED" });
    const id = text(request.params.id);
    if (!id) return reply.code(400).send({ error:"WORKFORCE_REQUEST_ID_REQUIRED" });

    const now = new Date().toISOString();
    const result = await mutateScheduleState({
      site,
      user,
      action:"workforce-schedule-request-cancel",
      entityId:id,
      mutate({ modules, module }) {
        const staffId = resolveWorkforceStaffId(user, modules);
        if (!staffId) return { ok:false, status:403, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };
        const item = module.requests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_REQUEST_NOT_FOUND" };
        if (text(item.staffId) !== staffId) return { ok:false, status:403, error:"WORKFORCE_REQUEST_NOT_OWN" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_REQUEST_NOT_PENDING" };
        const before = requestPayload(item);
        item.status = "cancelled";
        item.cancelledAt = now;
        item.cancelledByUserId = String(user.id || "");
        item.cancelledByName = actorName(user);
        return {
          ok:true,
          module,
          before,
          after:requestPayload(item),
          metadata:{ staffId, date:item.date, type:item.type },
          payload:requestPayload(item),
        };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/schedule-requests/:id/approve", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageSchedule(user)) return reply.code(403).send({ error:"WORKFORCE_SCHEDULE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    if (!id) return reply.code(400).send({ error:"WORKFORCE_REQUEST_ID_REQUIRED" });

    const now = new Date().toISOString();
    const decidedByName = actorName(user);
    const result = await mutateScheduleState({
      site,
      user,
      action:"workforce-schedule-request-approve",
      entityId:id,
      mutate({ module }) {
        const item = module.requests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_REQUEST_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_REQUEST_NOT_PENDING" };
        if (module.exceptions.some((entry) => text(entry?.staffId) === text(item.staffId) && text(entry?.date) === text(item.date))) {
          return { ok:false, status:409, error:"WORKFORCE_REQUEST_EXCEPTION_EXISTS" };
        }

        const source = baseScheduleResolution(module, text(item.staffId), text(item.date));
        if (source.ambiguous) return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_CHANGED" };
        if (item.sourceSnapshot) {
          if (!source.schedule || text(source.schedule.id) !== text(item.sourceScheduleId) || !snapshotsEqual(source.schedule, item.sourceSnapshot)) {
            return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_CHANGED" };
          }
        } else if (source.schedule) {
          return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_CHANGED" };
        }
        if (item.type === "change" && !source.schedule) {
          return { ok:false, status:409, error:"WORKFORCE_REQUEST_SCHEDULE_CHANGED" };
        }

        const before = requestPayload(item);
        const exception = {
          id:`schedule-exception-${randomUUID()}`,
          requestId:id,
          staffId:text(item.staffId),
          staffName:text(item.staffName),
          date:text(item.date),
          kind:item.type === "change" ? "override" : "leave",
          sourceScheduleId:text(item.sourceScheduleId),
          start:item.type === "change" ? text(item.requestedStart) : "",
          end:item.type === "change" ? text(item.requestedEnd) : "",
          department:item.type === "change"
            ? (source.schedule?.department === "outside" ? "outside" : "inside")
            : "",
          area:item.type === "change" ? text(source.schedule?.area) : "",
          shift:item.type === "change" ? text(source.schedule?.shift) : "",
          approvedAt:now,
          approvedByUserId:String(user.id || ""),
          approvedByName:decidedByName,
        };
        module.exceptions.unshift(exception);
        module.exceptions = module.exceptions.slice(0, 1000);
        item.status = "approved";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = decidedByName;
        item.decisionNote = text(request.body?.note);
        item.exceptionId = exception.id;
        return {
          ok:true,
          module,
          before,
          after:requestPayload(item),
          metadata:{
            staffId:item.staffId,
            date:item.date,
            type:item.type,
            exception:structuredClone(exception),
          },
          payload:requestPayload(item),
        };
      },
    });
    return respondMutation(reply, result);
  });

  app.post("/api/workforce/:site/schedule-requests/:id/reject", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateSite(user, site, reply)) return;
    if (!canManageSchedule(user)) return reply.code(403).send({ error:"WORKFORCE_SCHEDULE_MANAGER_REQUIRED" });
    const id = text(request.params.id);
    if (!id) return reply.code(400).send({ error:"WORKFORCE_REQUEST_ID_REQUIRED" });
    const note = text(request.body?.note);
    if (note.length < 3) return reply.code(400).send({ error:"WORKFORCE_REQUEST_DECISION_NOTE_REQUIRED" });

    const now = new Date().toISOString();
    const result = await mutateScheduleState({
      site,
      user,
      action:"workforce-schedule-request-reject",
      entityId:id,
      mutate({ module }) {
        const item = module.requests.find((entry) => text(entry?.id) === id);
        if (!item) return { ok:false, status:404, error:"WORKFORCE_REQUEST_NOT_FOUND" };
        if (item.status !== "pending") return { ok:false, status:409, error:"WORKFORCE_REQUEST_NOT_PENDING" };
        const before = requestPayload(item);
        item.status = "rejected";
        item.decidedAt = now;
        item.decidedByUserId = String(user.id || "");
        item.decidedByName = actorName(user);
        item.decisionNote = note;
        return {
          ok:true,
          module,
          before,
          after:requestPayload(item),
          metadata:{ staffId:item.staffId, date:item.date, type:item.type, note },
          payload:requestPayload(item),
        };
      },
    });
    return respondMutation(reply, result);
  });
}
