import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);

function text(value) {
  return String(value ?? "").trim();
}

function validMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function validCompletedAttendance(entry) {
  const start = Date.parse(String(entry?.clockIn || ""));
  const end = Date.parse(String(entry?.clockOut || ""));
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

function actorName(user) {
  return text(user?.display_name || user?.displayName || user?.username || "manager");
}

function canManageWorkforce(user) {
  return Boolean(
    user
    && ["admin", "manager"].includes(String(user.role || ""))
    && hasPermission(user, "attendance", "edit")
  );
}

function attendanceModule(modules = {}) {
  const input = modules?.attendance && typeof modules.attendance === "object" && !Array.isArray(modules.attendance)
    ? structuredClone(modules.attendance)
    : {};
  if (!Array.isArray(input.attendance)) input.attendance = [];
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
  const value = module?.payroll?.periods?.[month];
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function policySnapshot(payroll = {}) {
  const snapshot = structuredClone(payroll || {});
  delete snapshot.periods;
  return snapshot;
}

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
}

async function mutateAttendanceState({ site, user, action, entityType, entityId, mutate }) {
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
    const beforeModule = attendanceModule(modules);
    const result = mutate(beforeModule);
    if (!result?.ok) return result || { ok:false, status:400, error:"WORKFORCE_MUTATION_INVALID" };

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
       ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
      [
        user.id,
        user.username,
        action,
        entityType,
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

function validateRequest(user, site, reply) {
  if (!VALID_SITES.has(site)) {
    reply.code(400).send({ error:"INVALID_SITE" });
    return false;
  }
  if (!siteAllowed(user, site)) {
    reply.code(403).send({ error:"SITE_NOT_ALLOWED" });
    return false;
  }
  if (!canManageWorkforce(user)) {
    reply.code(403).send({ error:"WORKFORCE_MANAGER_REQUIRED" });
    return false;
  }
  return true;
}

export async function registerWorkforceApprovalRoutes(app) {
  app.post("/api/workforce/:site/attendance/:id/approve", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateRequest(user, site, reply)) return;
    const id = text(request.params.id);
    if (!id) return reply.code(400).send({ error:"WORKFORCE_ATTENDANCE_ID_REQUIRED" });

    const now = new Date().toISOString();
    const approvedByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-attendance-approve",
      entityType:"attendance",
      entityId:id,
      mutate(module) {
        const entry = module.attendance.find((item) => text(item?.id) === id);
        if (!entry) return { ok:false, status:404, error:"WORKFORCE_ATTENDANCE_NOT_FOUND" };
        if (!validCompletedAttendance(entry)) {
          return { ok:false, status:409, error:"WORKFORCE_ATTENDANCE_INCOMPLETE" };
        }
        const month = text(entry.date).slice(0, 7);
        if (periodFor(module, month)?.status === "locked") {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
        }
        if (entry.approvalStatus === "approved") {
          return {
            ok:true,
            unchanged:true,
            payload:{ id, month, approvalStatus:"approved", approvedAt:entry.approvedAt || null, approvedByName:entry.approvedByName || "" },
          };
        }

        const before = structuredClone(entry);
        entry.approvalStatus = "approved";
        entry.approvedAt = now;
        entry.approvedByUserId = String(user.id || "");
        entry.approvedByName = approvedByName;
        return {
          ok:true,
          module,
          before,
          after:structuredClone(entry),
          metadata:{ month },
          payload:{ id, month, approvalStatus:"approved", approvedAt:now, approvedByName },
        };
      },
    });
    if (!result.ok) return reply.code(result.status || 400).send({ error:result.error });
    return { ok:true, unchanged:Boolean(result.unchanged), moduleRevision:result.moduleRevision, revision:result.revision, updatedAt:result.updatedAt, approval:result.payload };
  });

  app.post("/api/workforce/:site/payroll-periods/:month/lock", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateRequest(user, site, reply)) return;
    const month = text(request.params.month);
    if (!validMonth(month)) return reply.code(400).send({ error:"WORKFORCE_PAYROLL_MONTH_INVALID" });

    const now = new Date().toISOString();
    const lockedByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-payroll-period-lock",
      entityType:"payroll_period",
      entityId:month,
      mutate(module) {
        const currentPeriod = periodFor(module, month);
        if (currentPeriod?.status === "locked") {
          return { ok:true, unchanged:true, payload:structuredClone(currentPeriod) };
        }
        const monthEntries = module.attendance.filter((entry) => text(entry?.date).startsWith(`${month}-`));
        const incomplete = monthEntries.filter((entry) => !validCompletedAttendance(entry));
        if (incomplete.length) {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_OPEN_SHIFTS" };
        }
        const completed = monthEntries.filter(validCompletedAttendance);
        if (!completed.length) {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_EMPTY" };
        }
        const unapproved = completed.filter((entry) => entry.approvalStatus !== "approved");
        if (unapproved.length) {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS" };
        }

        const before = currentPeriod ? structuredClone(currentPeriod) : null;
        const period = {
          month,
          status:"locked",
          lockedAt:now,
          lockedByUserId:String(user.id || ""),
          lockedByName,
          policySnapshot:policySnapshot(module.payroll),
          approvedAttendanceIds:completed.map((entry) => String(entry.id || "")).filter(Boolean),
        };
        module.payroll.periods[month] = period;
        return {
          ok:true,
          module,
          before,
          after:structuredClone(period),
          metadata:{ approvedCount:completed.length },
          payload:structuredClone(period),
        };
      },
    });
    if (!result.ok) return reply.code(result.status || 400).send({ error:result.error });
    return { ok:true, unchanged:Boolean(result.unchanged), moduleRevision:result.moduleRevision, revision:result.revision, updatedAt:result.updatedAt, period:result.payload };
  });

  app.post("/api/workforce/:site/payroll-periods/:month/reopen", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!validateRequest(user, site, reply)) return;
    const month = text(request.params.month);
    if (!validMonth(month)) return reply.code(400).send({ error:"WORKFORCE_PAYROLL_MONTH_INVALID" });
    const reason = text(request.body?.reason);
    if (reason.length < 3) return reply.code(400).send({ error:"WORKFORCE_REOPEN_REASON_REQUIRED" });

    const now = new Date().toISOString();
    const reopenedByName = actorName(user);
    const result = await mutateAttendanceState({
      site,
      user,
      action:"workforce-payroll-period-reopen",
      entityType:"payroll_period",
      entityId:month,
      mutate(module) {
        const currentPeriod = periodFor(module, month);
        if (!currentPeriod || currentPeriod.status !== "locked") {
          return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_NOT_LOCKED" };
        }
        const before = structuredClone(currentPeriod);
        const period = {
          ...currentPeriod,
          status:"open",
          reopenedAt:now,
          reopenedByUserId:String(user.id || ""),
          reopenedByName,
          reopenReason:reason,
        };
        module.payroll.periods[month] = period;
        return {
          ok:true,
          module,
          before,
          after:structuredClone(period),
          metadata:{ reason },
          payload:structuredClone(period),
        };
      },
    });
    if (!result.ok) return reply.code(result.status || 400).send({ error:result.error });
    return { ok:true, moduleRevision:result.moduleRevision, revision:result.revision, updatedAt:result.updatedAt, period:result.payload };
  });
}
