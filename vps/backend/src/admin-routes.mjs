import { pool, withTransaction } from "./db.mjs";
import { hashPassword } from "./password.mjs";
import { requireUser } from "./auth.mjs";

const VALID_ROLES = new Set(["admin","manager","supervisor","employee","parttime","central"]);
const VALID_LOCATIONS = new Set(["all","central","fuxing","yongji"]);

function requireAdmin(user, reply) {
  if (user?.role === "admin") return true;
  reply.code(403).send({ error: "ADMIN_REQUIRED" });
  return false;
}

function normalizePermissions(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input;
}

function normalizePreferredLanguage(value) {
  return ["vi","zh","zh-TW"].includes(value) ? value : "vi";
}

export async function registerAdminRoutes(app) {
  app.get("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const { rows } = await pool.query(
      `select id,username,display_name,role,location,permissions,
              preferred_language,active,created_at,updated_at,
              password_hash is not null as has_password
       from public.app_users
       order by created_at,id`
    );
    return { users: rows };
  });

  app.post("/api/admin/users", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user || !requireAdmin(user, reply)) return;

    const action = String(request.body?.action || "create");
    const id = String(request.body?.id || "");
    const username = String(request.body?.username || "").trim().toLowerCase();
    const displayName = String(request.body?.display_name || request.body?.displayName || "").trim();
    const role = String(request.body?.role || "employee");
    const location = String(request.body?.location || "fuxing");
    const permissions = normalizePermissions(request.body?.permissions);
    const preferredLanguage = normalizePreferredLanguage(request.body?.preferred_language);
    const active = request.body?.active !== false;
    const password = String(request.body?.password || "");

    if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
      return reply.code(400).send({ error: "USERNAME_FORMAT" });
    }
    if (!displayName) return reply.code(400).send({ error: "DISPLAY_NAME_REQUIRED" });
    if (!VALID_ROLES.has(role)) return reply.code(400).send({ error: "INVALID_ROLE" });
    if (!VALID_LOCATIONS.has(location)) return reply.code(400).send({ error: "INVALID_LOCATION" });

    try {
      if (action === "create") {
        if (password.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });
        const passwordHash = await hashPassword(password);
        const result = await pool.query(
          `insert into public.app_users(
             username,display_name,password_hash,password_changed_at,
             role,location,permissions,preferred_language,active
           ) values($1,$2,$3,now(),$4,$5,$6::jsonb,$7,$8)
           returning id,username,display_name,role,location,permissions,
                     preferred_language,active,created_at,updated_at`,
          [username,displayName,passwordHash,role,location,JSON.stringify(permissions),preferredLanguage,active]
        );
        return { user: result.rows[0] };
      }

      if (action !== "update" || !id) {
        return reply.code(400).send({ error: "INVALID_ACCOUNT_ACTION" });
      }
      if (id === user.id && (!active || role !== "admin")) {
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
               permissions=$6::jsonb,
               preferred_language=$7,
               active=$8,
               password_hash=case when $9::text is null then password_hash else $9 end,
               password_changed_at=case when $9::text is null then password_changed_at else now() end
           where id=$1
           returning id,username,display_name,role,location,permissions,
                     preferred_language,active,created_at,updated_at`,
          [id,username,displayName,role,location,JSON.stringify(permissions),preferredLanguage,active,passwordHash]
        );
        if (!updated.rowCount) {
          throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
        }
        if (id !== user.id) {
          await client.query("delete from public.sessions where user_id=$1", [id]);
        }
        return updated.rows[0];
      });
      return { user: result };
    } catch (error) {
      if (error?.code === "23505") return reply.code(409).send({ error: "USERNAME_EXISTS" });
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
