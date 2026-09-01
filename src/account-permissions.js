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

export const ACCOUNT_ROLE_DEFAULTS = {
  admin: Object.fromEntries(ACCOUNT_MODULES.map((key) => [key, { view: true, edit: true }])),
  manager: Object.fromEntries(ACCOUNT_MODULES.map((key) => [key, { view: true, edit: key !== "settings" }])),
  supervisor: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:true,edit:true},
    reservations:{view:true,edit:true}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
    sop:{view:true,edit:false}, skills:{view:true,edit:true}, attendance:{view:true,edit:false},
    schedule:{view:true,edit:false}, reports:{view:true,edit:false}, remote:{view:false,edit:false},
    settings:{view:false,edit:false},
  },
  employee: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:false,edit:false},
    reservations:{view:true,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
    sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true},
    schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false},
    settings:{view:false,edit:false},
  },
  parttime: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:false}, procurement:{view:false,edit:false},
    reservations:{view:false,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
    sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true},
    schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false},
    settings:{view:false,edit:false},
  },
  central: {
    dashboard:{view:false,edit:false}, inventory:{view:true,edit:true}, procurement:{view:false,edit:false},
    reservations:{view:false,edit:false}, preparation:{view:false,edit:false}, menu:{view:false,edit:false},
    sop:{view:false,edit:false}, skills:{view:false,edit:false}, attendance:{view:false,edit:false},
    schedule:{view:false,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false},
    settings:{view:false,edit:false},
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function isAdminAccount(user) {
  return Boolean(user && (user.role === "admin" || user.accountRole === "admin"));
}

export function fullAccountPermissions() {
  return clone(ACCOUNT_ROLE_DEFAULTS.admin);
}

export function normalizeAccountPermissions(role, input) {
  const effectiveRole = role || "employee";
  if (effectiveRole === "admin") return fullAccountPermissions();

  const base = clone(ACCOUNT_ROLE_DEFAULTS[effectiveRole] || ACCOUNT_ROLE_DEFAULTS.employee);
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const key of ACCOUNT_MODULES) {
    const value = input[key];
    if (!value || typeof value !== "object") continue;
    const view = Boolean(value.view);
    base[key] = { view, edit: view && Boolean(value.edit) };
  }
  return base;
}

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
  const role = user.accountRole || user.role || "employee";
  const permissions = normalizeAccountPermissions(role, user.permissions);
  return Boolean(permissions?.[moduleKey]?.[action]);
}
