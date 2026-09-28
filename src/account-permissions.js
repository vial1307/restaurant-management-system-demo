export const ACCOUNT_MODULES = [
  "dashboard",
  "inventory",
  "procurement",
  "reservations",
  "preparation",
  "menu",
  "sop",
  "skills",
  "attendance",
  "schedule",
  "reports",
  "remote",
  "settings",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function emptyAccountPermissions() {
  return Object.fromEntries(
    ACCOUNT_MODULES.map((key) => [key, { view: false, edit: false }])
  );
}

export function fullAccountPermissions() {
  return Object.fromEntries(
    ACCOUNT_MODULES.map((key) => [key, { view: true, edit: true }])
  );
}

export function isAdminAccount(user) {
  return Boolean(user && (user.role === "admin" || user.accountRole === "admin"));
}

// Frontend permissions are a projection of the authenticated Database session.
// Never grant permissions from a source-coded role template. Missing or partial
// permission payloads are intentionally fail-closed; only explicit DB/session
// grants survive normalization. Admin remains the sole built-in full-access
// system role, matching the VPS permission normalizer.
export function normalizeAccountPermissions(role, input) {
  const effectiveRole = String(role || "");
  if (effectiveRole === "admin") return fullAccountPermissions();

  const base = emptyAccountPermissions();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const key of ACCOUNT_MODULES) {
    const value = input[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const view = Boolean(value.view);
    base[key] = { view, edit: view && Boolean(value.edit) };
  }
  return base;
}

export const BUSINESS_ACTION_MODULE = Object.freeze({
  "sop:edit": "sop",
  "sop:approve": "sop",
  "sop:delete": "sop",
  "skills:manage": "skills",
  "skills:evaluate": "skills",
  "skills:approve": "skills",
  "staff:manage": "settings",
  "attendance:manage": "attendance",
  "reports:export": "reports",
  "checks:record": "sop",
  "schedule:manage": "schedule",
  "jobs:manage": "remote",
  "tasks:assign": "preparation",
});

export function currentAccountSession(storage = globalThis.localStorage) {
  try {
    if (!storage?.getItem) return null;
    return JSON.parse(storage.getItem("shitu-kitchen-auth-v1") || "null");
  } catch {
    return null;
  }
}

export function signedInAdmin(storage = globalThis.localStorage) {
  return isAdminAccount(currentAccountSession(storage));
}

export function accountCan(user, moduleKey, action = "view") {
  if (!user) return false;
  if (isAdminAccount(user)) return true;
  const role = user.accountRole || user.role || "";
  const permissions = normalizeAccountPermissions(role, user.permissions);
  return Boolean(permissions?.[moduleKey]?.[action]);
}

export function accountCanBusinessAction(user, permission) {
  if (!user) return false;
  if (isAdminAccount(user)) return true;
  const moduleKey = BUSINESS_ACTION_MODULE[String(permission || "")];
  if (!moduleKey) return false;
  const action = permission === "reports:export" ? "view" : "edit";
  return accountCan(user, moduleKey, action);
}
