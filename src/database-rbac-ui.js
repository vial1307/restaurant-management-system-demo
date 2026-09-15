import { apiRequest, isVpsApiConfigured } from "./vps-api.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const ACCESS_MODEL_KEY = "shitu-access-model-v1";
const SYNC_THROTTLE_MS = 5000;

let accessModel = null;
let sessionSyncInFlight = null;
let modelSyncInFlight = null;
let lastSessionSyncAt = 0;

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function policyRoleFromUser(user) {
  if (user?.policyRole) return String(user.policyRole);
  if (user?.role === "admin") return "admin";
  if (user?.role === "central") return "central";
  const caps = user?.capabilities || {};
  const perms = user?.permissions || {};
  if (caps["accounts.manage"]) return "admin";
  if (caps["inventory.receive_defaults.manage"]) return "manager";
  if (caps["inventory.stocktake"]) return "supervisor";
  if (caps["workforce.self_service"] && perms?.inventory?.edit) return "employee";
  if (caps["workforce.self_service"]) return "parttime";
  if (user?.roleScopePolicy === "central" || user?.location === "central") return "central";
  return "branch";
}

function sessionFamily(policyRole) {
  if (policyRole === "admin") return "admin";
  if (policyRole === "central") return "central";
  return "branch";
}

async function syncSessionFromDatabase({ force = false } = {}) {
  if (!isVpsApiConfigured()) return null;
  const now = Date.now();
  if (!force && now - lastSessionSyncAt < SYNC_THROTTLE_MS) return readJson(AUTH_KEY, null);
  if (sessionSyncInFlight) return sessionSyncInFlight;

  sessionSyncInFlight = (async () => {
    try {
      const result = await apiRequest("/api/auth/me");
      const user = result?.user;
      if (!user?.id) return null;
      const previous = readJson(AUTH_KEY, {}) || {};
      const policyRole = policyRoleFromUser(user);
      const next = {
        ...previous,
        id: user.id,
        username: user.username,
        name: user.displayName || user.username,
        role: sessionFamily(policyRole),
        accountRole: policyRole,
        rankCode: user.role,
        location: user.location,
        permissions: user.permissions || {},
        capabilities: user.capabilities || {},
        hierarchyLevel: Number(user.hierarchyLevel || 0),
        roleParent: user.roleParent || null,
        roleScopePolicy: user.roleScopePolicy || "assigned",
        roleNameVi: user.roleNameVi || "",
        roleNameZhTw: user.roleNameZhTw || "",
        preferredLanguage: user.preferredLanguage || previous.preferredLanguage || "vi",
        provider: "vps",
      };
      writeJson(AUTH_KEY, next);
      lastSessionSyncAt = Date.now();
      window.dispatchEvent(new CustomEvent("shitu:rbac-synced", { detail:{ rankCode:next.rankCode, policyRole } }));
      return next;
    } catch {
      return null;
    } finally {
      sessionSyncInFlight = null;
    }
  })();
  return sessionSyncInFlight;
}

function validAccessModel(value) {
  return Boolean(value && Array.isArray(value.roles) && Array.isArray(value.modules));
}

async function loadAccessModel({ force = false } = {}) {
  if (!isVpsApiConfigured()) return null;
  if (!force && validAccessModel(accessModel)) return accessModel;
  if (!force) {
    const cached = readJson(ACCESS_MODEL_KEY, null);
    if (validAccessModel(cached)) accessModel = cached;
  }
  if (modelSyncInFlight) return modelSyncInFlight;

  modelSyncInFlight = (async () => {
    try {
      const model = await apiRequest("/api/admin/access-model");
      if (!validAccessModel(model)) return accessModel;
      accessModel = model;
      writeJson(ACCESS_MODEL_KEY, model);
      patchVisibleAccountUi();
      return model;
    } catch {
      return accessModel;
    } finally {
      modelSyncInFlight = null;
    }
  })();
  return modelSyncInFlight;
}

function currentLanguage() {
  const session = readJson(AUTH_KEY, null);
  return String(session?.preferredLanguage || "vi").startsWith("zh") ? "zh" : "vi";
}

function roleLabel(role) {
  if (!role) return "";
  return currentLanguage() === "zh"
    ? (role.name_zh_tw || role.name_vi || role.code)
    : `${role.name_vi || role.code}${role.name_zh_tw ? ` · ${role.name_zh_tw}` : ""}`;
}

function accountById(id) {
  const accounts = readJson(ACCOUNTS_KEY, []);
  return Array.isArray(accounts) ? accounts.find((account) => String(account?.id || "") === String(id || "")) : null;
}

function roleByCode(code) {
  return accessModel?.roles?.find((role) => role.code === code) || null;
}

function applyPermissionPreview(modal, role) {
  if (!modal || !role) return;
  modal.querySelectorAll('input[name^="perm:"]').forEach((input) => {
    const match = String(input.name || "").match(/^perm:(.+):(view|edit)$/);
    if (!match) return;
    const [, moduleKey, action] = match;
    input.checked = Boolean(role.permissions?.[moduleKey]?.[action]);
    input.disabled = true;
    input.setAttribute("aria-readonly", "true");
  });

  let note = modal.querySelector("[data-rbac-permission-note]");
  if (!note) {
    note = document.createElement("p");
    note.dataset.rbacPermissionNote = "";
    note.className = "account-storage-note";
    modal.querySelector(".permission-grid")?.insertAdjacentElement("afterend", note);
  }
  if (note) {
    note.textContent = currentLanguage() === "zh"
      ? "權限由資料庫中的職級設定決定；此處僅預覽。"
      : "Quyền được quyết định bởi cấu hình cấp bậc trong database; phần này chỉ để xem trước.";
  }
}

function applyScopePolicy(modal, role) {
  const locationSelect = modal?.querySelector('select[name="location"]');
  if (!locationSelect || !role) return;
  if (role.scope_policy === "all") locationSelect.value = "all";
  else if (role.scope_policy === "central") locationSelect.value = "central";
  else if (!["fuxing","yongji"].includes(locationSelect.value)) locationSelect.value = "fuxing";

  const locked = role.scope_policy !== "assigned";
  locationSelect.dataset.rbacLocked = locked ? "true" : "false";
  locationSelect.setAttribute("aria-readonly", locked ? "true" : "false");
  locationSelect.style.pointerEvents = locked ? "none" : "";
  locationSelect.style.opacity = locked ? "0.72" : "";
  locationSelect.tabIndex = locked ? -1 : 0;
}

function applyRoleToModal(modal, code) {
  const role = roleByCode(code);
  if (!role) return;
  applyScopePolicy(modal, role);
  applyPermissionPreview(modal, role);
}

function patchAccountModal(modal) {
  if (!modal || modal.dataset.databaseRbacBound === "true" || !validAccessModel(accessModel)) return;
  const roleSelect = modal.querySelector('select[name="role"]');
  if (!roleSelect) return;

  const form = modal.querySelector("[data-account-form]");
  const account = accountById(form?.dataset.editId || "");
  const selectedCode = account?.role || roleSelect.value || accessModel.roles[0]?.code || "";
  roleSelect.innerHTML = accessModel.roles
    .map((role) => `<option value="${String(role.code).replaceAll('"','&quot;')}">${roleLabel(role)}</option>`)
    .join("");
  if (roleByCode(selectedCode)) roleSelect.value = selectedCode;
  else if (accessModel.roles[0]) roleSelect.value = accessModel.roles[0].code;

  roleSelect.addEventListener("change", () => {
    queueMicrotask(() => applyRoleToModal(modal, roleSelect.value));
  });
  const locationSelect = modal.querySelector('select[name="location"]');
  locationSelect?.addEventListener("change", () => {
    const role = roleByCode(roleSelect.value);
    if (role?.scope_policy === "all") locationSelect.value = "all";
    if (role?.scope_policy === "central") locationSelect.value = "central";
  });

  modal.dataset.databaseRbacBound = "true";
  queueMicrotask(() => applyRoleToModal(modal, roleSelect.value));
}

function patchAccountRoleLabels() {
  if (!validAccessModel(accessModel)) return;
  document.querySelectorAll(".account-row").forEach((row) => {
    const edit = row.querySelector("[data-account-edit]");
    const account = accountById(edit?.dataset.accountEdit || "");
    const role = roleByCode(account?.role);
    if (!role) return;
    const directSpans = row.querySelectorAll(":scope > span");
    if (directSpans[1]) directSpans[1].textContent = roleLabel(role);
  });
}

function patchVisibleAccountUi() {
  patchAccountRoleLabels();
  document.querySelectorAll("[data-account-modal]").forEach((modal) => patchAccountModal(modal));
}

const observer = new MutationObserver(() => {
  if (!validAccessModel(accessModel)) return;
  patchVisibleAccountUi();
});
observer.observe(document.body, { childList:true, subtree:true });

window.addEventListener("shitu:auth-synced", () => {
  void syncSessionFromDatabase({ force:true }).then((session) => {
    if (session?.capabilities?.["accounts.manage"]) void loadAccessModel({ force:true });
  });
});
window.addEventListener("shitu:vps-auth-ready", () => {
  void syncSessionFromDatabase({ force:true }).then((session) => {
    if (session?.capabilities?.["accounts.manage"]) void loadAccessModel();
  });
});
window.addEventListener("shitu:accounts-synced", patchVisibleAccountUi);
window.addEventListener("focus", () => { void syncSessionFromDatabase(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncSessionFromDatabase();
});

if (isVpsApiConfigured()) {
  setTimeout(() => {
    void syncSessionFromDatabase({ force:true }).then((session) => {
      if (session?.capabilities?.["accounts.manage"]) void loadAccessModel();
    });
  }, 0);
}
