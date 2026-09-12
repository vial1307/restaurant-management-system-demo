import { pool, withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import {
  isWorkforceSelfServiceUser,
  mergeSelfServiceAttendance,
  scopeWorkforceModules,
} from "./workforce-policy.mjs";
import {
  enforceSelfServiceUnlocked,
  mergeManagedAttendance,
} from "./workforce-lock-policy.mjs";
import { registerWorkforceApprovalRoutes } from "./workforce-approval-routes.mjs";
import { registerWorkforceRequestRoutes } from "./workforce-request-routes.mjs";

const MODULE_RULES = {
  settings: ["settings"],
  reservations: ["reservations", "dashboard"],
  procurement: ["procurement"],
  preparation: ["preparation", "dashboard"],
  menu: ["menu"],
  sop: ["sop"],
  skills: ["skills"],
  attendance: ["attendance"],
  schedule: ["schedule"],
  remote: ["remote"],
  shared: ["settings", "skills", "attendance", "schedule", "preparation", "dashboard"],
  audit: ["reports", "remote"],
};

function validSite(site) {
  return ["central", "fuxing", "yongji"].includes(site);
}

function can(user, moduleName, action) {
  const rules = MODULE_RULES[moduleName] || [];
  if (action === "edit" && ["reservations", "preparation"].includes(moduleName)) {
    return hasPermission(user, moduleName, "edit");
  }
  // Workforce management mutations are intentionally stricter than generic
  // permission bits. Supervisor is non-management for attendance correction and
  // scheduling under the approved role matrix, including legacy accounts whose
  // stored permissions may still contain edit=true.
  if (action === "edit" && ["attendance", "schedule"].includes(moduleName) && user?.role === "supervisor") {
    return false;
  }
  if (action === "edit" && moduleName === "schedule" && isWorkforceSelfServiceUser(user)) {
    return false;
  }
  if (moduleName === "shared" && action === "edit") {
    return user.role === "admin" || hasPermission(user, "settings", "edit");
  }
  if (moduleName === "audit" && action === "edit") {
    return user.role === "admin" || Object.values(user.permissions || {}).some((entry) => entry?.edit);
  }
  return rules.some((permission) => hasPermission(user, permission, action));
}

export { can as canBusinessModule };

function filteredModules(user, modules) {
  const permitted = Object.fromEntries(
    Object.entries(modules || {}).filter(([moduleName]) => can(user, moduleName, "view"))
  );
  return scopeWorkforceModules(user, permitted, modules || {});
}

function validStoredRevision(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function filteredModuleRevisions(user, modules, revisions) {
  const storedModules = modules && typeof modules === "object" ? modules : {};
  const storedRevisions = revisions && typeof revisions === "object" ? revisions : {};
  return Object.fromEntries(
    Object.keys(MODULE_RULES).flatMap((moduleName) => {
      if (!can(user, moduleName, "view")) return [];
      const revision = validStoredRevision(storedRevisions[moduleName]);
      if (revision !== null) return [[moduleName, revision]];
      return Object.hasOwn(storedModules, moduleName) ? [] : [[moduleName, 0]];
    })
  );
}

function requestedModules(body) {
  const input = body?.modules;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => MODULE_RULES[key] && value && typeof value === "object" && !Array.isArray(value))
  );
}

function requestedModuleRevisions(body) {
  const input = body?.expectedModuleRevisions;
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function validExpectedRevision(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function currentRevision(revisions, moduleName) {
  return validStoredRevision(revisions?.[moduleName]) ?? 0;
}

function mergeAuditModule(before, incoming) {
  const serverEntries = Array.isArray(before?.audit) ? before.audit : [];
  const incomingEntries = Array.isArray(incoming?.audit) ? incoming.audit : [];
  const seen = new Set();
  const merged = [];
  for (const entry of [...serverEntries, ...incomingEntries]) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(entry);
  }
  merged.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { audit: merged.slice(0, 500) };
}

function preserveScheduleWorkflow(before, incoming) {
  const stored = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const next = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? structuredClone(incoming) : {};
  next.requests = structuredClone(Array.isArray(stored.requests) ? stored.requests : []);
  next.exceptions = structuredClone(Array.isArray(stored.exceptions) ? stored.exceptions : []);
  return next;
}

export async function registerBusinessStateRoutes(app) {
  await registerWorkforceApprovalRoutes(app);
  await registerWorkforceRequestRoutes(app);

  app.get("/api/business-state/:site", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = String(request.params.site || "");
    if (!validSite(site)) return reply.code(400).send({ error: "INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error: "SITE_NOT_ALLOWED" });

    const { rows } = await pool.query(
      "select modules,module_revisions,revision,updated_at from public.business_state where site=$1",
      [site]
    );
    const row = rows[0];
    const modules = row?.modules || {};
    return {
      site,
      modules: filteredModules(user, modules),
      moduleRevisions: filteredModuleRevisions(user, modules, row?.module_revisions || {}),
      revision: Number(row?.revision || 0),
      updatedAt: row?.updated_at || null,
    };
  });

  app.post("/api/business-state/:site", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = String(request.params.site || "");
    if (!validSite(site)) return reply.code(400).send({ error: "INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error: "SITE_NOT_ALLOWED" });
    const incoming = requestedModules(request.body);
    if (!incoming) return reply.code(400).send({ error: "INVALID_BUSINESS_STATE" });

    const editable = Object.fromEntries(
      Object.entries(incoming).filter(([moduleName]) => can(user, moduleName, "edit"))
    );
    const editableNames = Object.keys(editable);
    if (!editableNames.length) {
      return reply.code(403).send({ error: "BUSINESS_STATE_EDIT_NOT_ALLOWED" });
    }

    const selfServiceAttendance = isWorkforceSelfServiceUser(user) && Object.hasOwn(editable, "attendance");
    // Self-service attendance uses a server-side record merge under the row lock,
    // so it must not conflict merely because another employee changed the same
    // branch-wide attendance module between reads.
    const guardedNames = editableNames.filter((moduleName) => (
      moduleName !== "audit" && !(selfServiceAttendance && moduleName === "attendance")
    ));
    const expectedInput = requestedModuleRevisions(request.body);
    const expected = Object.fromEntries(
      guardedNames.map((moduleName) => [moduleName, validExpectedRevision(expectedInput[moduleName])])
    );
    const missingModules = guardedNames.filter((moduleName) => expected[moduleName] === null);
    if (missingModules.length) {
      return reply.code(409).send({ error: "BUSINESS_STATE_REVISION_REQUIRED", site, missingModules });
    }

    const result = await withTransaction(async (client) => {
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
      const before = current.rows[0]?.modules || {};
      const beforeRevisions = current.rows[0]?.module_revisions || {};
      const invalidBaselineModules = guardedNames.filter(
        (moduleName) => Object.hasOwn(before, moduleName) && validStoredRevision(beforeRevisions[moduleName]) === null
      );
      if (invalidBaselineModules.length) {
        return { revisionRequired: true, missingModules: invalidBaselineModules };
      }
      const conflictingModules = guardedNames.filter(
        (moduleName) => expected[moduleName] !== currentRevision(beforeRevisions, moduleName)
      );
      if (conflictingModules.length) {
        const rawConflictModules = Object.fromEntries(
          conflictingModules
            .filter((moduleName) => can(user, moduleName, "view") && before[moduleName] !== undefined)
            .map((moduleName) => [moduleName, before[moduleName]])
        );
        const conflictModules = scopeWorkforceModules(user, rawConflictModules, before);
        const conflictRevisions = Object.fromEntries(
          conflictingModules
            .filter((moduleName) => can(user, moduleName, "view"))
            .map((moduleName) => [moduleName, currentRevision(beforeRevisions, moduleName)])
        );
        return { conflict: true, conflictingModules, modules: conflictModules, moduleRevisions: conflictRevisions };
      }

      const effectiveEditable = { ...editable };
      let workforceAudit = null;
      if (selfServiceAttendance) {
        const workforceMerge = mergeSelfServiceAttendance(user, before, effectiveEditable.attendance);
        if (!workforceMerge.ok) {
          return { workforceDenied:true, error:workforceMerge.error, status:workforceMerge.status || 403 };
        }
        const lockPolicy = enforceSelfServiceUnlocked(before, workforceMerge.module);
        if (!lockPolicy.ok) {
          return { workforceDenied:true, error:lockPolicy.error, status:lockPolicy.status || 409 };
        }
        effectiveEditable.attendance = lockPolicy.module;
      } else if (Object.hasOwn(effectiveEditable, "attendance")) {
        const workforceMerge = mergeManagedAttendance(before, effectiveEditable.attendance);
        if (!workforceMerge.ok) {
          return { workforceDenied:true, error:workforceMerge.error, status:workforceMerge.status || 403 };
        }
        effectiveEditable.attendance = workforceMerge.module;
        workforceAudit = workforceMerge.audit || null;
      }

      if (Object.hasOwn(effectiveEditable, "schedule")) {
        effectiveEditable.schedule = preserveScheduleWorkflow(before.schedule, effectiveEditable.schedule);
      }

      const next = { ...before, ...effectiveEditable };
      if (effectiveEditable.audit) next.audit = mergeAuditModule(before.audit, effectiveEditable.audit);
      const nextRevisions = { ...beforeRevisions };
      for (const moduleName of editableNames) {
        nextRevisions[moduleName] = currentRevision(beforeRevisions, moduleName) + 1;
      }
      const saved = await client.query(
        `update public.business_state
         set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=now()
         where site=$1
         returning revision,updated_at`,
        [site, JSON.stringify(next), JSON.stringify(nextRevisions), user.id]
      );
      const savedModuleRevisions = Object.fromEntries(
        editableNames.map((moduleName) => [moduleName, nextRevisions[moduleName]])
      );
      const auditMetadata = { modules: editableNames, moduleRevisions: savedModuleRevisions };
      if (workforceAudit?.changedAttendanceIds?.length) {
        auditMetadata.workforceAttendanceChanges = workforceAudit.changedAttendanceIds;
      }
      await client.query(
        `insert into public.audit_logs(
           actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
         ) values($1,$2,'save','business_state',$3,$3,null,null,$4::jsonb)`,
        [user.id, user.username, site, JSON.stringify(auditMetadata)]
      );
      return { ...saved.rows[0], moduleRevisions: savedModuleRevisions };
    });

    if (result.revisionRequired) {
      return reply.code(409).send({
        error: "BUSINESS_STATE_REVISION_REQUIRED",
        site,
        missingModules: result.missingModules,
      });
    }
    if (result.conflict) {
      return reply.code(409).send({
        error: "BUSINESS_STATE_CONFLICT",
        site,
        conflictingModules: result.conflictingModules,
        moduleRevisions: result.moduleRevisions,
        modules: result.modules,
      });
    }
    if (result.workforceDenied) {
      return reply.code(result.status || 403).send({ error:result.error || "WORKFORCE_EDIT_NOT_ALLOWED", site });
    }

    return {
      ok: true,
      site,
      savedModules: editableNames,
      moduleRevisions: result.moduleRevisions,
      revision: Number(result.revision),
      updatedAt: result.updated_at,
    };
  });
}
