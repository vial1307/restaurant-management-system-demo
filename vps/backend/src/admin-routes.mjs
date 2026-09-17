import { pool, withTransaction } from "./db.mjs";
import { hashPassword } from "./password.mjs";
import { hasCapability, requireUser } from "./auth.mjs";
import { hydrateUserAccess, listAccessModel, resolveRoleProfile } from "./access-control.mjs";
import { registerMasterDataRoutes } from "./master-data-routes.mjs";
import { registerInventoryMasterRoutes } from "./inventory-master-routes.mjs";
import { registerSuperAdminRoutes } from "./super-admin-routes.mjs";
import { activeSite } from "./site-registry.mjs";

function requireAdmin(user, reply) {
  if (hasCapability(user, "accounts.manage")) return true;
  reply.code(403).send({ error: "ADMIN_REQUIRED" });
  return false;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePreferredLanguage(value) {
  return ["vi","zh","zh-TW"].includes(value) ? value : "vi";
}

function requestedPreferredLanguage(body) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "preferred_language")) return null;
  return normalizePreferredLanguage(body.preferred_language);
}

async function normalizePermissionOverrides(input, client = pool) {
  if (input === undefined) return null;
  const raw = object(input);
  const { rows } = await client.query(
    "select module_key from public.permission_modules where active=true order by sort_order,module_key"
  );
  const result = {};
  for (const row of rows) {
    const moduleRule = object(raw[row.module_key]);
    if (!Object.prototype.hasOwnProperty.call(raw,row.module_key)) continue;
    const view = Boolean(moduleRule.view);
    result[row.module_key] = { view,edit:view && Boolean(moduleRule.edit) };
  }
  return result;
}

async function resolveRequestedRole(role, location, client = pool) {
  const profile = await resolveRoleProfile(role, location, client);
  if (!profile) throw Object.assign(new Error("INVALID_ROLE"), { statusCode:400 });

  if (profile.scopePolicy === "all") return profile;

  const effectiveLocation = String(profile.effectiveLocation || location || "").trim();
  const site = await activeSite(effectiveLocation, client);
  if (!site) {
    throw Object.assign(new Error("INVALID_LOCATION"), { statusCode:400 });
  }

  if (profile.scopePolicy === "assigned" && String(site.metadata?.inventory_mode || "") !== "branch") {
    throw Object.assign(new Error("INVALID_LOCATION_FOR_ROLE"), { statusCode:400 });
  }

  return profile;
}

async function writeAccountAudit(client, user, { action, entityId, before = null, after = null }) {
  await client.query(
    `insert into public.audit_logs(
       actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
     ) values($1,$2,$3,'app_user',$4,null,$5::jsonb,$6::jsonb,'{}'::jsonb)`,
    [user.id,user.username,action,String(entityId || ""),before === null ? null : JSON.stringify(before),after === null ? null : JSON.stringify(after)]
  );
}

async function adminUserPayload(row, client = pool) {
  if (!row) return null;
  const hydrated = await hydrateUserAccess({ ...row, role_code:row.role }, client);
  if (!hydrated) return null;
  return {
    id: hydrated.id,
    username: hydrated.username,
    display_name: hydrated.display_name,
    role: hydrated.role_code,
    location: hydrated.location,
    permission_overrides: hydrated.permission_overrides || {},
    permissions: hydrated.permissions || {},
    capabilities: hydrated.capabilities || {},
    hierarchy_level: Number(hydrated.hierarchy_level || 0),
    role_parent: hydrated.role_parent || null,
    role_scope_policy: hydrated.role_scope_policy || "assigned",
    role_name_vi: hydrated.role_name_vi || "",
    role_name_zh_tw: hydrated.role_name_zh_tw || "",
    preferred_language: hydrated.preferred_language || "vi",
    active: hydrated.active,
    created_at: hydrated.created_at,
    updated_at: hydrated.updated_at,
    has_password: hydrated.has_password,
  };
}

export async function registerAdminRoutes(app) {
  await registerMasterDataRoutes(app);
  await registerInventoryMasterRoutes(app);
  await registerSuperAdminRoutes(app);

  app.get("/api/admin/access-model", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;
    const model = await listAccessModel();
    if (hasCapability(user,"system.super_admin")) return model;
    return {
      ...model,
      roles:model.roles.filter((role) => !role.capabilities?.["system.super_admin"]),
      capabilities:model.capabilities.filter((capability) => capability.capability_key !== "system.super_admin"),
    };
  });

  app.get("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const { rows } = await pool.query(
      `select id,username,display_name,role,location,permission_overrides,
              preferred_language,active,created_at,updated_at,
              password_hash is not null as has_password
       from public.app_users
       order by created_at,id`
    );
    const payload = (await Promise.all(rows.map((row) => adminUserPayload(row)))).filter(Boolean);
    return {
      users:hasCapability(user,"system.super_admin")
        ? payload
        : payload.filter((entry) => !entry.capabilities?.["system.super_admin"]),
    };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const action = String(request.body?.action || "create");
    const id = String(request.body?.id || "");
    const username = String(request.body?.username || "").trim().toLowerCase();
    const displayName = String(request.body?.display_name || request.body?.displayName || "").trim();
    const role = String(request.body?.role || "employee").trim();
    const location = String(request.body?.location || "").trim();
    const preferredLanguage = requestedPreferredLanguage(request.body);
    const active = request.body?.active !== false;
    const password = String(request.body?.password || "");
    const isSuperAdmin = hasCapability(user,"system.super_admin");

    if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
      return reply.code(400).send({ error: "USERNAME_FORMAT" });
    }
    if (!displayName) return reply.code(400).send({ error: "DISPLAY_NAME_REQUIRED" });
    if (password && password.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });

    try {
      const requestedRole = await resolveRequestedRole(role, location);
      if (requestedRole.capabilities?.["system.super_admin"] && !isSuperAdmin) {
        return reply.code(403).send({ error:"SUPER_ADMIN_REQUIRED" });
      }
      const effectiveLocation = requestedRole.effectiveLocation;

      if (action === "create") {
        if (password.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });
        const passwordHash = await hashPassword(password);
        const result = await withTransaction(async (client) => {
          const permissionOverrides = await normalizePermissionOverrides(request.body?.permissions,client) || {};
          const inserted = await client.query(
            `insert into public.app_users(
               username,display_name,password_hash,password_changed_at,
               role,location,permission_overrides,preferred_language,active
             ) values($1,$2,$3,now(),$4,$5,$6::jsonb,$7,$8)
             returning id,username,display_name,role,location,permission_overrides,
                       preferred_language,active,created_at,updated_at,
                       password_hash is not null as has_password`,
            [username,displayName,passwordHash,role,effectiveLocation,JSON.stringify(permissionOverrides),preferredLanguage || "vi",active]
          );
          await writeAccountAudit(client,user,{action:"account_create",entityId:inserted.rows[0].id,after:inserted.rows[0]});
          return inserted.rows[0];
        });
        return { user:await adminUserPayload(result) };
      }

      if (action !== "update" || !id) {
        return reply.code(400).send({ error: "INVALID_ACCOUNT_ACTION" });
      }
      if (id === user.id && (!active || !requestedRole.capabilities?.["accounts.manage"] || (isSuperAdmin && !requestedRole.capabilities?.["system.super_admin"]))) {
        return reply.code(409).send({ error: "CANNOT_REMOVE_OWN_ADMIN_ACCESS" });
      }

      const passwordHash = password ? await hashPassword(password) : null;
      const result = await withTransaction(async (client) => {
        const current = (await client.query(
          `select id,username,display_name,role,location,permission_overrides,preferred_language,active,created_at,updated_at,
                  password_hash is not null as has_password
           from public.app_users where id=$1 for update`,[id]
        )).rows[0];
        if (!current) throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode:404 });
        const currentRole = await resolveRoleProfile(current.role,current.location,client);
        if (currentRole?.capabilities?.["system.super_admin"] && !isSuperAdmin) {
          throw Object.assign(new Error("SUPER_ADMIN_REQUIRED"),{statusCode:403});
        }
        const permissionOverrides = await normalizePermissionOverrides(request.body?.permissions,client);
        const updated = await client.query(
          `update public.app_users
           set username=$2,
               display_name=$3,
               role=$4,
               location=$5,
               preferred_language=coalesce($6::text,preferred_language),
               active=$7,
               password_hash=case when $8::text is null then password_hash else $8 end,
               password_changed_at=case when $8::text is null then password_changed_at else now() end,
               permission_overrides=coalesce($9::jsonb,permission_overrides)
           where id=$1
           returning id,username,display_name,role,location,permission_overrides,
                     preferred_language,active,created_at,updated_at,
                     password_hash is not null as has_password`,
          [id,username,displayName,role,effectiveLocation,preferredLanguage,active,passwordHash,permissionOverrides === null ? null : JSON.stringify(permissionOverrides)]
        );
        if (id !== user.id) await client.query("delete from public.sessions where user_id=$1", [id]);
        await writeAccountAudit(client,user,{action:"account_update",entityId:id,before:current,after:updated.rows[0]});
        return updated.rows[0];
      });
      return await adminUserPayload(result).then((payload) => ({ user:payload }));
    } catch (error) {
      if (error?.code === "23505") return reply.code(409).send({ error: "USERNAME_EXISTS" });
      if (error?.code === "23503") return reply.code(400).send({ error: "INVALID_ROLE" });
      return reply.code(error.statusCode || 500).send({ error: error.message || "ACCOUNT_SAVE_FAILED" });
    }
  });

  app.delete("/api/admin/users/:id", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const id = String(request.params.id || "");
    if (!id) return reply.code(400).send({ error: "USER_ID_REQUIRED" });
    if (id === user.id) return reply.code(409).send({ error: "CANNOT_DELETE_SELF" });

    try {
      const result = await withTransaction(async (client) => {
        const current = (await client.query(
          `select id,username,display_name,role,location,permission_overrides,preferred_language,active,created_at,updated_at
           from public.app_users where id=$1 for update`,[id]
        )).rows[0];
        if (!current) throw Object.assign(new Error("USER_NOT_FOUND"),{statusCode:404});
        const currentRole = await resolveRoleProfile(current.role,current.location,client);
        if (currentRole?.capabilities?.["system.super_admin"] && !hasCapability(user,"system.super_admin")) {
          throw Object.assign(new Error("SUPER_ADMIN_REQUIRED"),{statusCode:403});
        }
        await client.query("delete from public.sessions where user_id=$1", [id]);

        const refs = await client.query(
          `select
             (select count(*) from public.inventory_transactions where actor_user_id=$1)
             + (select count(*) from public.audit_logs where actor_user_id=$1) as refs`,
          [id]
        );

        if (Number(refs.rows[0]?.refs || 0) > 0) {
          const archived = await client.query(
            "update public.app_users set active=false where id=$1 returning id,username,active",
            [id]
          );
          await writeAccountAudit(client,user,{action:"account_archive",entityId:id,before:current,after:archived.rows[0]});
          return { deleted:false, archived:true, user:archived.rows[0] || null };
        }

        const deleted = await client.query(
          "delete from public.app_users where id=$1 returning id,username",
          [id]
        );
        await writeAccountAudit(client,user,{action:"account_delete",entityId:id,before:current,after:null});
        return { deleted:Boolean(deleted.rowCount), archived:false, user:deleted.rows[0] || null };
      });
      return result;
    } catch (error) {
      return reply.code(error.statusCode || 500).send({ error:error.message || "ACCOUNT_DELETE_FAILED" });
    }
  });
}
