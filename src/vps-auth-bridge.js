import {
  vpsChangePassword,
  vpsDeleteUser,
  vpsListUsers,
  vpsLogin,
  vpsLogout,
  vpsMe,
  vpsSaveUser,
} from "./vps-api.js";
import { ACCOUNT_MODULES, normalizeAccountPermissions } from "./account-permissions.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
document.documentElement.dataset.vpsAuthReady = "checking";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const PERMISSION_MODULES = ["dashboard", ...ACCOUNT_MODULES.filter((key) => key !== "dashboard")];

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function legacySession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

function permissionsFromForm(data) {
  return Object.fromEntries(PERMISSION_MODULES.map((key) => {
    const view = data.has(`perm:${key}:view`);
    return [key, { view, edit: view && data.has(`perm:${key}:edit`) }];
  }));
}

function normalizeVpsUser(user) {
  if (!user) return null;
  const accountRole = user.role || "employee";
  return {
    id: user.id,
    username: user.username,
    name: user.displayName || user.display_name || user.username,
    role: accountRole === "admin" ? "admin" : accountRole === "central" ? "central" : "branch",
    accountRole,
    location: accountRole === "admin" ? "all" : (user.location || "fuxing"),
    permissions: normalizeAccountPermissions(accountRole, user.permissions),
    preferredLanguage: user.preferredLanguage || user.preferred_language || "vi",
    provider: "vps",
  };
}

function mirrorVpsSession(user) {
  const normalized = normalizeVpsUser(user);
  if (normalized) localStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
  return normalized;
}

function initialRoute(profile) {
  if (profile?.location === "central" && profile.permissions?.inventory?.view !== false) return "#inventory";
  if (profile?.permissions?.dashboard?.view !== false) return "#dashboard";
  const first = ACCOUNT_MODULES.find((key) => profile?.permissions?.[key]?.view);
  return first ? `#${first}` : "#inventory";
}

async function syncProfiles(profile = null) {
  const current = profile || mirrorVpsSession((await vpsMe())?.user);
  if (!current || current.accountRole !== "admin") return;
  const result = await vpsListUsers();
  const accounts = (result?.users || []).map((user) => ({
    id: user.id,
    username: user.username,
    password: "",
    name: user.display_name,
    role: user.role,
    location: user.location,
    active: user.active,
    permissions: user.permissions || {},
    preferredLanguage: user.preferred_language || "vi",
    provider: "vps",
  }));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  window.dispatchEvent(new CustomEvent("shitu:accounts-synced"));
}

async function boot() {
  const previous = legacySession();
  try {
    const profile = mirrorVpsSession((await vpsMe())?.user);
    if (profile) window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
  } catch (error) {
    if (previous?.provider === "vps" && Number(error?.status) === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent("shitu:auth-expired"));
    }
  } finally {
    document.documentElement.dataset.vpsAuthReady = "true";
    window.dispatchEvent(new CustomEvent("shitu:vps-auth-ready"));
  }
}

let lastProfileRefresh = 0;
async function refreshProfile() {
  if (document.visibilityState === "hidden") return;
  const now = Date.now();
  if (now - lastProfileRefresh < 30000) return;
  lastProfileRefresh = now;
  try {
    const profile = mirrorVpsSession((await vpsMe())?.user);
    if (profile) window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
  } catch {}
}

function showLoginError(message) {
  const form = document.querySelector("#auth-login-form");
  if (!form) return;
  let box = document.querySelector(".auth-error");
  if (!box) {
    form.insertAdjacentHTML("beforebegin", '<div class="auth-error"></div>');
    box = document.querySelector(".auth-error");
  }
  if (box) box.textContent = message;
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === "auth-login-form") {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const username = String(data.get("username") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    try {
      const profile = mirrorVpsSession((await vpsLogin(username, password))?.user);
      if (!profile) throw new Error("ACCOUNT_DISABLED");
      await syncProfiles(profile);
      document.body.classList.remove("auth-locked");
      document.querySelector("#auth-layer")?.remove();
      history.replaceState(null, "", `${location.pathname}${initialRoute(profile)}`);
      window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
    } catch (error) {
      const code = error instanceof Error ? (error.code || error.message) : "";
      showLoginError(code === "USERNAME_FORMAT"
        ? "Tài khoản chỉ dùng chữ a-z, số, dấu chấm, gạch dưới hoặc gạch ngang. · 帳號僅限英數字、點、底線或連字號。"
        : code === "ACCOUNT_DISABLED"
          ? "Tài khoản đã bị khóa. · 帳號已停用。"
          : "Sai tài khoản hoặc mật khẩu. · 帳號或密碼錯誤。");
    }
    return;
  }

  if (form.matches("[data-account-self-password]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const current = String(data.get("current") || "");
    const next = String(data.get("next") || "");
    const confirmPassword = String(data.get("confirm") || "");
    const message = form.querySelector("[data-account-self-message]");
    if (next.length < 10) {
      if (message) message.textContent = "Mật khẩu tối thiểu 10 ký tự. · 密碼至少 10 碼。";
      return;
    }
    if (next !== confirmPassword) {
      if (message) message.textContent = "Mật khẩu xác nhận không khớp. · 兩次密碼不一致。";
      return;
    }
    try {
      await vpsChangePassword(current, next);
      localStorage.removeItem(AUTH_KEY);
      if (message) message.textContent = "Đã đổi mật khẩu. Vui lòng đăng nhập lại. · 密碼已更新，請重新登入。";
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      const code = error instanceof Error ? (error.code || error.message) : "";
      if (message) message.textContent = code === "CURRENT_PASSWORD_INVALID"
        ? "Mật khẩu hiện tại không đúng. · 目前密碼錯誤。"
        : "Không thể đổi mật khẩu. · 密碼更新失敗。";
    }
    return;
  }

  if (form.matches("[data-account-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const id = String(form.dataset.editId || "");
    const body = {
      action: id ? "update" : "create",
      id: id || undefined,
      username: String(data.get("username") || "").trim().toLowerCase(),
      password: String(data.get("password") || ""),
      display_name: String(data.get("name") || "").trim(),
      role: String(data.get("role") || "employee"),
      location: String(data.get("location") || "fuxing"),
      active: data.has("active"),
      permissions: permissionsFromForm(data),
    };
    const message = form.querySelector("[data-account-form-message]");
    try {
      await vpsSaveUser(body);
      await syncProfiles();
      document.querySelector("[data-account-modal]")?.remove();
      location.reload();
    } catch (error) {
      const code = error instanceof Error ? (error.code || error.message) : "";
      if (message) message.textContent = `Không thể lưu tài khoản. · 帳號儲存失敗。 ${esc(code)}`;
    }
  }
}, true);

document.addEventListener("click", async (event) => {
  const logoutButton = event.target.closest(".auth-user-chip button");
  if (logoutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await vpsLogout(); } catch {}
    localStorage.removeItem(AUTH_KEY);
    history.replaceState(null, "", `${location.pathname}#dashboard`);
    window.dispatchEvent(new CustomEvent("shitu:auth-expired"));
    return;
  }

  const deleteButton = event.target.closest("[data-account-delete]");
  if (!deleteButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!confirm("Xóa tài khoản này? · 確定刪除此帳號？")) return;
  try {
    await vpsDeleteUser(deleteButton.dataset.accountDelete);
    await syncProfiles();
    document.querySelector("[data-account-modal]")?.remove();
    location.reload();
  } catch (error) {
    alert(`Không thể xóa tài khoản. · 帳號刪除失敗。 ${error instanceof Error ? (error.code || error.message) : ""}`);
  }
}, true);

window.addEventListener("shitu:logout", async () => {
  try { await vpsLogout(); } catch {}
  localStorage.removeItem(AUTH_KEY);
});
window.addEventListener("pageshow", () => { void refreshProfile(); });
window.addEventListener("focus", () => { void refreshProfile(); });
document.addEventListener("visibilitychange", () => { void refreshProfile(); });

void boot();
