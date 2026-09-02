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

export function fullPermissions() {
  return Object.fromEntries(
    ACCOUNT_MODULES.map((key) => [key, { view: true, edit: true }])
  );
}

export function normalizePermissionsForRole(role, input) {
  if (role === "admin") return fullPermissions();

  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const result = {};
  for (const key of ACCOUNT_MODULES) {
    if (!source[key] || typeof source[key] !== "object") continue;
    const view = Boolean(source[key].view);
    result[key] = { view, edit: view && Boolean(source[key].edit) };
  }
  return result;
}

export function normalizeLocationForRole(role, location) {
  if (role === "admin") return "all";
  if (role === "central") return "central";
  return location;
}
