import { pool, withTransaction } from "./db.mjs";
import { hashPassword } from "./password.mjs";
import { hasCapability, requireUser } from "./auth.mjs";
import { hydrateUserAccess, listAccessModel, resolveRoleProfile } from "./access-control.mjs";
import { registerMasterDataRoutes } from "./master-data-routes.mjs";
import { registerInventoryMasterRoutes } from "./inventory-master-routes.mjs";

const VALID_LOCATIONS = new Set(["all","central","fuxing","yongji"]);

function requireAdmin(user, reply) {
  if (hasCapability(user, "accounts.manage")) return true;
  reply.code(403).send({ error: "ADMIN_REQUIRED" });
  return false;
}

function normalizePreferredLanguage(value) {
  return ["vi","zh","zh-TW"].includes(value) ? value : "vi";
}

function requestedPreferredLanguage(body) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, "preferred_language")) return null;
  return normalizePreferredLanguage(body.preferred_language);
}

async function resolveRequestedRole(role, location, client = pool) {
  if (!VALID_LOCATIONS.has(location)) {
    throw Object.assign(new Error("INVALID_LOCATION"), { statusCode:400 });
  }
  const profile = await resolveRoleProfile(role, location, client);
  if (!profile) throw Object.assign(new Error("INVALID_ROLE"), { statusCode:400 });
  if (profile.scopePolicy === "assigned" && !["fuxing","yongji"].includes(location)) {
    throw Object.assign(new Error("INVALID_LOCATION_FOR_ROLE"), { statusCode:400 });
  }
  return profile;
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

  app.get("/api/admin/access-model", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;
    return listAccessModel();
  });

  app.get("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const { rows } = await pool.query(
      `select id,username,display_name,role,location,
              preferred_language,active,created_at,updated_at,
              password_hash is not null as has_password
       from public.app_users
       order by created_at,id`
    );
    return { users:(await Promise.all(rows.map((row) => adminUserPayload(row)))).filter(Boolean) };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const action = String(request.body?.action || "create");
    const id = String(request.body?.id || "");
    const username = String(request.body?.username || "").trim().toLowerCase();
    const displayName = String(request.body?.display_name || request.body?.displayName || "").trim();
    const role = String(request.body?.role || "employee").trim();
    const location = String(request.body?.location || "fuxing").trim();
    const preferredLanguage = requestedPreferredLanguage(request.body);
    const active = request.body?.active !== false;
    const password = String(request.body?.password || "");

    if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
      return reply.code(400).send({ error: "USERNAME_FORMAT" });
    }
    if (!displayName) return reply.code(400).send({ error: "DISPLAY_NAME_REQUIRED" });
    if (password && password.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });

    try {
      const requestedRole = await resolveRequestedRole(role, location);
      const effectiveLocation = requestedRole.effectiveLocation;

      if (action === "create") {
        if (password.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });
        const passwordHash = await hashPassword(password);
        const result = await pool.query(
          `insert into public.app_users(
             username,display_name,password_hash,password_changed_at,
             role,location,permissions,preferred_language,active
           ) values($1,$2,$3,now(),$4,$5,'{}'::jsonb,$6,$7)
           returning id,username,display_name,role,location,
                     preferred_language,active,created_at,updated_at,
                     password_hash is not null as has_password`,
          [username,displayName,passwordHash,role,effectiveLocation,preferredLanguage || "vi",active]
        );
        return { user:await adminUserPayload(result.rows[0]) };
      }

      if (action !== "update" || !id) {
        return reply.code(400).send({ error: "INVALID_ACCOUNT_ACTION" });
      }
      if (id === user.id && (!active || !requestedRole.capabilities?.["accounts.manage"])) {
        return reply.code(409).send({ error: "CANNOT_REMOVE_OWN_ADMIN_ACCESS" });
      }

      const passwordHash = password ? await hashPassword(password) : null;
      const result = await withTransaction(async (client) => {
        const updated = await client.query(
          `update public.app_users
           set username=$2,
               display_name=$3,
               role=$4,
               location=$5,
               preferred_language=coalesce($6::text,preferred_language),
               active=$7,
               password_hash=case when $8::text is null then password_hash else $8 end,
               password_changed_at=case when $8::text is null then password_changed_at else now() end
           where id=$1
           returning id,username,display_name,role,location,
                     preferred_language,active,created_at,updated_at,
                     password_hash is not null as has_password`,
          [id,username,displayName,role,effectiveLocation,preferredLanguage,active,passwordHash]
        );
        if (!updated.rowCount) {
          throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
        }
        if (id !== user.id) {
          await client.query("delete from public.sessions where user_id=$1", [id]);
        }
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

    const result = await withTransaction(async (client) => {
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
        return { deleted:false, archived:true, user:archived.rows[0] || null };
      }

      const deleted = await client.query(
        "delete from public.app_users where id=$1 returning id,username",
        [id]
      );
      return { deleted:Boolean(deleted.rowCount), archived:false, user:deleted.rows[0] || null };
    });

    return result;
  });
}
