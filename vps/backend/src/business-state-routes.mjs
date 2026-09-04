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

function requestedModules(body) {
  const input = body?.modules;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => MODULE_RULES[key] && value && typeof value === "object" && !Array.isArray(value))
  );
}

export async function registerBusinessStateRoutes(app) {
  app.get("/api/business-state/:site", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = String(request.params.site || "");
    if (!validSite(site)) return reply.code(400).send({ error: "INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error: "SITE_NOT_ALLOWED" });

    const { rows } = await pool.query(
      "select modules,revision,updated_at from public.business_state where site=$1",
      [site]
    );
    const row = rows[0];
    return {
      site,
      modules: filteredModules(user, row?.modules || {}),
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
    if (!Object.keys(editable).length) {
      return reply.code(403).send({ error: "BUSINESS_STATE_EDIT_NOT_ALLOWED" });
    }

    const result = await withTransaction(async (client) => {
      await client.query(
        `insert into public.business_state(site,modules,revision,updated_by)
         values($1,'{}'::jsonb,0,$2)
         on conflict (site) do nothing`,
        [site, user.id]
      );
      const current = await client.query(
        "select modules,revision from public.business_state where site=$1 for update",
        [site]
      );
      const before = current.rows[0]?.modules || {};
      const next = { ...before, ...editable };
      const saved = await client.query(
        `update public.business_state
         set modules=$2::jsonb,revision=revision+1,updated_by=$3,updated_at=now()
         where site=$1
         returning revision,updated_at`,
        [site, JSON.stringify(next), user.id]
      );
      await client.query(
        `insert into public.audit_logs(
           actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
         ) values($1,$2,'save','business_state',$3,$3,null,null,$4::jsonb)`,
        [user.id, user.username, site, JSON.stringify({ modules:Object.keys(editable) })]
      );
      return saved.rows[0];
    });

    return {
      ok: true,
      site,
      savedModules: Object.keys(editable),
      revision: Number(result.revision),
      updatedAt: result.updated_at,
    };
  });
}
