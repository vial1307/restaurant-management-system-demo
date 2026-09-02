import crypto from "node:crypto";
import { pool } from "./db.mjs";
import { normalizeLocationForRole, normalizePermissionsForRole } from "./permissions.mjs";

export const SESSION_COOKIE = "kitchen_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId, reply) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  await pool.query(
    `insert into public.sessions(user_id,token_hash,expires_at,last_seen_at)
     values($1,$2,now()+($3 || ' days')::interval,now())`,
    [userId, hash, String(SESSION_DAYS)]
  );

  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(request, reply) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (token) {
    await pool.query("delete from public.sessions where token_hash=$1", [tokenHash(token)]);
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function resolveSession(request) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const { rows } = await pool.query(
    `select
       u.id,u.username,u.display_name,u.role,u.location,u.permissions,
       u.preferred_language,u.active,
       s.id as session_id,s.expires_at
     from public.sessions s
     join public.app_users u on u.id=s.user_id
     where s.token_hash=$1
       and s.expires_at > now()
       and u.active=true
     limit 1`,
    [tokenHash(token)]
  );

  const user = rows[0] || null;
  if (user) {
    void pool.query(
      "update public.sessions set last_seen_at=now() where id=$1 and last_seen_at < now()-interval '5 minutes'",
      [user.session_id]
    ).catch(() => {});
  }
  return user;
}

export async function requireUser(request, reply) {
  const user = await resolveSession(request);
  if (!user) {
    reply.code(401).send({ error: "AUTH_REQUIRED" });
    return null;
  }
  request.user = user;
  return user;
}

export function hasPermission(user, moduleName, actionName) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.permissions?.[moduleName]?.[actionName]);
}

export function siteAllowed(user, site) {
  if (!user) return false;
  const location = normalizeLocationForRole(user.role, user.location);
  return location === "all" || location === site;
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    location: normalizeLocationForRole(user.role, user.location),
    permissions: normalizePermissionsForRole(user.role, user.permissions),
    preferredLanguage: user.preferred_language || "vi",
    active: user.active,
  };
}
