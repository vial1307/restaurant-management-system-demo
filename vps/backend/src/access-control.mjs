import { pool } from "./db.mjs";

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compatibilityRole(role) {
  const permissions = role.permissions || {};
  const capabilities = role.capabilities || {};
  if (capabilities["accounts.manage"]) return "admin";
  if (capabilities["inventory.receive_defaults.manage"]) return "manager";
  if (capabilities["inventory.stocktake"]) return "supervisor";
  if (capabilities["workforce.self_service"] && permissions?.inventory?.edit) return "employee";
  if (capabilities["workforce.self_service"]) return "parttime";
  if (role.scopePolicy === "central") return "central";
  return "branch";
}

export async function resolveRoleProfile(roleCode, requestedLocation = "", client = pool) {
  const role = String(roleCode || "").trim();
  if (!role) return null;

  const { rows } = await client.query(
    `select
       r.code,r.name_vi,r.name_zh_tw,r.hierarchy_level,r.parent_role_code,
       r.scope_policy,r.sort_order,r.active,
       public.effective_location_for_role(r.code,$2::text) as effective_location,
       coalesce((
         select jsonb_object_agg(
           p.module_key,
           jsonb_build_object('view',p.can_view,'edit',p.can_edit)
         )
         from public.resolve_role_module_permissions(r.code) p
       ),'{}'::jsonb) as permissions,
       coalesce((
         select jsonb_object_agg(c.capability_key,c.allowed)
         from public.resolve_role_capabilities(r.code) c
       ),'{}'::jsonb) as capabilities
     from public.account_roles r
     where r.code=$1 and r.active=true
     limit 1`,
    [role, String(requestedLocation || "")]
  );

  const row = rows[0];
  if (!row) return null;
  const profile = {
    code: row.code,
    nameVi: row.name_vi,
    nameZhTw: row.name_zh_tw,
    hierarchyLevel: Number(row.hierarchy_level || 0),
    parentRoleCode: row.parent_role_code || null,
    scopePolicy: row.scope_policy,
    sortOrder: Number(row.sort_order || 0),
    active: row.active !== false,
    effectiveLocation: row.effective_location || "",
    permissions: jsonObject(row.permissions),
    capabilities: jsonObject(row.capabilities),
  };
  return { ...profile, compatibilityRole:compatibilityRole(profile) };
}

export async function hydrateUserAccess(user, client = pool) {
  if (!user) return null;
  const roleCode = String(user.role_code || user.role || "").trim();
  const role = await resolveRoleProfile(roleCode, user.location, client);
  if (!role) return null;
  return {
    ...user,
    role: role.compatibilityRole,
    role_code: role.code,
    location: role.effectiveLocation,
    permissions: role.permissions,
    capabilities: role.capabilities,
    hierarchy_level: role.hierarchyLevel,
    role_parent: role.parentRoleCode,
    role_scope_policy: role.scopePolicy,
    role_name_vi: role.nameVi,
    role_name_zh_tw: role.nameZhTw,
  };
}

export function hasPermission(user, moduleName, actionName = "view") {
  if (!user) return false;
  return Boolean(user.permissions?.[moduleName]?.[actionName]);
}

export function hasCapability(user, capabilityKey) {
  if (!user) return false;
  return Boolean(user.capabilities?.[capabilityKey]);
}

export function siteAllowed(user, site) {
  if (!user) return false;
  return user.location === "all" || user.location === site;
}

export async function listAccessModel(client = pool) {
  const [rolesResult, modulesResult, capabilitiesResult] = await Promise.all([
    client.query(
      `select code,name_vi,name_zh_tw,hierarchy_level,parent_role_code,scope_policy,sort_order
       from public.account_roles
       where active=true
       order by sort_order,hierarchy_level,code`
    ),
    client.query(
      `select module_key,name_vi,name_zh_tw,sort_order
       from public.permission_modules
       where active=true
       order by sort_order,module_key`
    ),
    client.query(
      `select capability_key,description
       from public.permission_capabilities
       where active=true
       order by capability_key`
    ),
  ]);

  const roles = [];
  for (const row of rolesResult.rows) {
    // Permissions and capabilities are role data; they do not require a
    // hard-coded branch just to resolve the access model. Scope-specific
    // effective locations are validated when an account is saved.
    const resolved = await resolveRoleProfile(row.code, "", client);
    if (!resolved) continue;
    roles.push({
      code: row.code,
      name_vi: row.name_vi,
      name_zh_tw: row.name_zh_tw,
      hierarchy_level: Number(row.hierarchy_level || 0),
      parent_role_code: row.parent_role_code || null,
      scope_policy: row.scope_policy,
      sort_order: Number(row.sort_order || 0),
      permissions: resolved.permissions,
      capabilities: resolved.capabilities,
      compatibility_role: resolved.compatibilityRole,
    });
  }

  return {
    roles,
    modules: modulesResult.rows,
    capabilities: capabilitiesResult.rows,
  };
}
