import { pool, withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";

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
  if (moduleName === "shared" && action === "edit") {
    return user.role === "admin" || hasPermission(user, "settings", "edit");
  }
  if (moduleName === "audit" && action === "edit") {
    return user.role === "admin" || Object.values(user.permissions || {}).some((entry) => entry?.edit);
  }
  return rules.some((permission) => hasPermission(user, permission, action));
}

function filteredModules(user, modules) {
  return Object.fromEntries(
    Object.entries(modules || {}).filter(([moduleName]) => can(user, moduleName, "view"))
  );
}

function filteredModuleRevisions(user, revisions) {
  return Object.fromEntries(
    Object.entries(revisions || {})
      .filter(([moduleName]) => MODULE_RULES[moduleName] && can(user, moduleName, "view"))
      .map(([moduleName, revision]) => [moduleName, Math.max(0, Number(revision) || 0)])
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
  return Math.max(0, Number(revisions?.[moduleName]) || 0);
}

function mergeAuditModule(before, incoming) {
  const serverEntries = Array.isArray(before?.audit) ? before.audit : [];
  const incomingEntries = Array.isArray(incoming?.audit) ? incoming.audit : [];
  const seen = new Set();
  const merged = [];
  for (const entry of [...incomingEntries, ...serverEntries]) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(entry);
  }
  merged.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { audit: merged.slice(0, 500) };
}

export async function registerBusinessStateRoutes(app) {
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
    return {
      site,
      modules: filteredModules(user, row?.modules || {}),
      moduleRevisions: filteredModuleRevisions(user, row?.module_revisions || {}),
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

    // Audit is an append-only operational log. It is merged by unique entry id
    // inside the row lock, so it never blocks a primary business module write.
    const guardedNames = editableNames.filter((moduleName) => moduleName !== "audit");
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
      const conflictingModules = guardedNames.filter(
        (moduleName) => expected[moduleName] !== currentRevision(beforeRevisions, moduleName)
      );
      if (conflictingModules.length) {
        const conflictModules = Object.fromEntries(
          conflictingModules
            .filter((moduleName) => can(user, moduleName, "view") && before[moduleName] !== undefined)
            .map((moduleName) => [moduleName, before[moduleName]])
        );
        const conflictRevisions = Object.fromEntries(
          conflictingModules
            .filter((moduleName) => can(user, moduleName, "view"))
            .map((moduleName) => [moduleName, currentRevision(beforeRevisions, moduleName)])
        );
        return { conflict: true, conflictingModules, modules: conflictModules, moduleRevisions: conflictRevisions };
      }

      const next = { ...before, ...editable };
      if (editable.audit) next.audit = mergeAuditModule(before.audit, editable.audit);
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
      await client.query(
        `insert into public.audit_logs(
           actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
         ) values($1,$2,'save','business_state',$3,$3,null,null,$4::jsonb)`,
        [user.id, user.username, site, JSON.stringify({ modules: editableNames, moduleRevisions: savedModuleRevisions })]
      );
      return { ...saved.rows[0], moduleRevisions: savedModuleRevisions };
    });

    if (result.conflict) {
      return reply.code(409).send({
        error: "BUSINESS_STATE_CONFLICT",
        site,
        conflictingModules: result.conflictingModules,
        moduleRevisions: result.moduleRevisions,
        modules: result.modules,
      });
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
