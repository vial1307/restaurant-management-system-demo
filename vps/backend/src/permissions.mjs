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
  admin: Object.fromEntries(ACCOUNT_MODULES.map((key) => [key, { view:true, edit:true }])),
  manager: Object.fromEntries(ACCOUNT_MODULES.map((key) => [key, { view:true, edit:key !== "settings" }])),
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

export function fullPermissions() {
  return clone(ACCOUNT_ROLE_DEFAULTS.admin);
}

export function normalizePermissionsForRole(role, input) {
  const effectiveRole = ACCOUNT_ROLE_DEFAULTS[role] ? role : "employee";
  if (effectiveRole === "admin") return fullPermissions();

  const result = clone(ACCOUNT_ROLE_DEFAULTS[effectiveRole]);
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  for (const key of ACCOUNT_MODULES) {
    if (!source[key] || typeof source[key] !== "object" || Array.isArray(source[key])) continue;
    const view = Boolean(source[key].view);
    result[key] = { view, edit:view && Boolean(source[key].edit) };
  }
  return result;
}

export function permissionForRole(role, input, moduleName, actionName = "view") {
  return Boolean(normalizePermissionsForRole(role, input)?.[moduleName]?.[actionName]);
}

export function normalizeLocationForRole(role, location) {
  if (role === "admin") return "all";
  if (role === "central") return "central";
  return location;
}
