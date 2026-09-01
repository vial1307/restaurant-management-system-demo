import {
  getSupabase,
  getMyProfile,
  isSupabaseConfigured,
  loginEmailForUsername,
  mirrorSupabaseSessionToLegacy,
} from "./supabase-client.js";
import {
  isVpsApiConfigured,
  vpsChangePassword,
  vpsDeleteUser,
  vpsListUsers,
  vpsLogin,
  vpsLogout,
  vpsMe,
  vpsSaveUser,
} from "./vps-api.js";
import {
  ACCOUNT_MODULES,
  normalizeAccountPermissions,
} from "./account-permissions.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";

function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
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

function permissionsFromForm(data) {
  const permissions = {};
  for (const key of ACCOUNT_MODULES) {
    const view = data.has(`perm:${key}:view`);
    const edit = data.has(`perm:${key}:edit`);
    permissions[key] = { view, edit: view && edit };
  }
  return permissions;
}

function legacySession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}

function normalizeVpsUser(user) {
  if (!user) return null;
  const accountRole = user.role || "employee";
  const authRole = accountRole === "admin" ? "admin" : accountRole === "central" ? "central" : "branch";
  return {
    id: user.id,
    username: user.username,
    name: user.displayName || user.display_name || user.username,
    role: authRole,
    accountRole,
    location: accountRole === "admin" ? "all" : (user.location || "fuxing"),
    permissions: normalizeAccountPermissions(accountRole, user.permissions),
    preferredLanguage: user.preferredLanguage || user.preferred_language || "vi",
    provider: "vps",
  };
}

function mirrorVpsSession(user) {
  const normalized = normalizeVpsUser(user);
  if (!normalized) return null;
  localStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
  return normalized;
}

async function broadcastProfileChange(supabase, userId) {
  if (!supabase || !userId) return;
  const channel = supabase.channel(`kitchen-os-user-${userId}`);
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timeout = setTimeout(finish, 1800);
    channel.subscribe(async (status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timeout);
        finish();
        return;
      }
      if (status !== "SUBSCRIBED") return;
      try {
        await channel.send({ type: "broadcast", event: "profile", payload: { userId } });
      } catch {
      } finally {
        clearTimeout(timeout);
        finish();
      }
    });
  });
  try { await supabase.removeChannel(channel); } catch {}
}

function initialRoute(profile) {
  const permissions = profile?.permissions || {};
  if (profile?.location === "central" && permissions.inventory?.view !== false) return "#inventory";
  if (permissions.dashboard?.view !== false) return "#dashboard";
  const first = ACCOUNT_MODULES.find((key) => permissions[key]?.view);
  return first ? `#${first}` : "#inventory";
}

async function syncProfiles(profile = null, supabaseClient = null) {
  if (isVpsApiConfigured()) {
    const current = profile || normalizeVpsUser((await vpsMe())?.user);
    if (!current) return;
    mirrorVpsSession(current);
    const currentRole = current.accountRole || current.role;
    if (currentRole !== "admin") return;

    try {
      const result = await vpsListUsers();
      const mirrored = (result?.users || []).map((p) => ({
        id: p.id,
        username: p.username,
        password: "",
        name: p.display_name,
        role: p.role,
        location: p.location,
        active: p.active,
        permissions: p.permissions || {},
        preferredLanguage: p.preferred_language || "vi",
        provider: "vps",
      }));
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(mirrored));
      window.dispatchEvent(new CustomEvent("shitu:accounts-synced"));
    } catch {}
    return;
  }

  const supabase = supabaseClient || await getSupabase();
  if (!supabase) return;
  const currentProfile = profile || await getMyProfile({ force: true });
  if (!currentProfile) return;
  await mirrorSupabaseSessionToLegacy(currentProfile);

  if (currentProfile.role !== "admin") return;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,role,location,active,permissions")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return;
  const mirrored = data.map((p) => ({
    id: p.id,
    username: p.username,
    password: "",
    name: p.display_name,
    role: p.role,
    location: p.location,
    active: p.active,
    permissions: p.permissions || {},
    provider: "supabase",
  }));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(mirrored));
}

async function boot() {
  const legacy = legacySession();

  if (isVpsApiConfigured()) {
    try {
      const result = await vpsMe();
      const user = result?.user;
      if (!user?.active && user?.active !== undefined) {
        localStorage.removeItem(AUTH_KEY);
        return;
      }
      const profile = mirrorVpsSession(user);
      if (!profile) return;
      window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
      return;
    } catch (error) {
      if (legacy?.provider === "vps") {
        localStorage.removeItem(AUTH_KEY);
        location.reload();
      }
      return;
    }
  }

  if (!isSupabaseConfigured()) return;

  if (legacy && legacy.provider !== "supabase") localStorage.removeItem(AUTH_KEY);

  const supabase = await getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    if (legacy?.provider === "supabase") localStorage.removeItem(AUTH_KEY);
    return;
  }
  const profile = await getMyProfile({ force: true });
  if (!profile?.active) return;
  await mirrorSupabaseSessionToLegacy(profile);
  window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
}

document.addEventListener("submit", async (event) => {
  if (!isVpsApiConfigured() && !isSupabaseConfigured()) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === "auth-login-form") {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const username = String(data.get("username") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");

    try {
      let profile;
      if (isVpsApiConfigured()) {
        const result = await vpsLogin(username, password);
        profile = mirrorVpsSession(result?.user);
        if (!profile) throw new Error("ACCOUNT_DISABLED");
        await syncProfiles(profile);
      } else {
        const supabase = await getSupabase();
        const email = loginEmailForUsername(username);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const cloudProfile = await getMyProfile({ force: true });
        if (!cloudProfile?.active) {
          await supabase.auth.signOut();
          throw new Error("ACCOUNT_DISABLED");
        }
        await mirrorSupabaseSessionToLegacy(cloudProfile);
        await syncProfiles(cloudProfile, supabase);
        profile = cloudProfile;
      }

      document.body.classList.remove("auth-locked");
      document.querySelector("#auth-layer")?.remove();
      location.hash = initialRoute(profile);
      location.reload();
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

    const minLength = isVpsApiConfigured() ? 10 : 6;
    if (next.length < minLength) {
      if (message) message.textContent = `Mật khẩu tối thiểu ${minLength} ký tự. · 密碼至少 ${minLength} 碼。`;
      return;
    }
    if (next !== confirmPassword) {
      if (message) message.textContent = "Mật khẩu xác nhận không khớp. · 兩次密碼不一致。";
      return;
    }

    try {
      if (isVpsApiConfigured()) {
        await vpsChangePassword(current, next);
        localStorage.removeItem(AUTH_KEY);
        if (message) message.textContent = "Đã đổi mật khẩu. Vui lòng đăng nhập lại. · 密碼已更新，請重新登入。";
        setTimeout(() => location.reload(), 500);
      } else {
        const supabase = await getSupabase();
        const profile = await getMyProfile();
        const email = loginEmailForUsername(profile.username);
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (verifyError) throw new Error("WRONG_CURRENT");
        const { error } = await supabase.auth.updateUser({ password: next });
        if (error) throw error;
        if (message) message.textContent = "Đã đổi mật khẩu. · 密碼已更新。";
        form.reset();
      }
    } catch (error) {
      const code = error instanceof Error ? (error.code || error.message) : "";
      if (message) message.textContent = ["WRONG_CURRENT","CURRENT_PASSWORD_INVALID"].includes(code)
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
      if (isVpsApiConfigured()) {
        await vpsSaveUser(body);
        await syncProfiles();
      } else {
        const supabase = await getSupabase();
        const { data: result, error } = await supabase.functions.invoke("admin-users", { body });
        if (error || result?.error) throw new Error(result?.error || error?.message || "ADMIN_USER_FAILED");
        await syncProfiles();
        if (id) await broadcastProfileChange(supabase, id);
      }
      document.querySelector("[data-account-modal]")?.remove();
      location.reload();
    } catch (error) {
      const code = error instanceof Error ? (error.code || error.message) : "";
      if (message) message.textContent = `Không thể lưu tài khoản. · 帳號儲存失敗。 ${esc(code)}`;
    }
    return;
  }
}, true);

document.addEventListener("click", async (event) => {
  if (!isVpsApiConfigured() && !isSupabaseConfigured()) return;

  const logoutButton = event.target.closest(".auth-user-chip button");
  if (logoutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      if (isVpsApiConfigured()) await vpsLogout();
      else {
        const supabase = await getSupabase();
        await supabase?.auth.signOut();
      }
    } catch {}
    localStorage.removeItem(AUTH_KEY);
    location.hash = "#dashboard";
    location.reload();
    return;
  }

  const deleteButton = event.target.closest("[data-account-delete]");
  if (!deleteButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!confirm("Xóa tài khoản này? · 確定刪除此帳號？")) return;

  try {
    if (isVpsApiConfigured()) {
      await vpsDeleteUser(deleteButton.dataset.accountDelete);
      await syncProfiles();
    } else {
      const supabase = await getSupabase();
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete", id: deleteButton.dataset.accountDelete },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "DELETE_FAILED");
      await syncProfiles();
      await broadcastProfileChange(supabase, deleteButton.dataset.accountDelete);
    }
    document.querySelector("[data-account-modal]")?.remove();
    location.reload();
  } catch (error) {
    alert(`Không thể xóa tài khoản. · 帳號刪除失敗。 ${error instanceof Error ? (error.code || error.message) : ""}`);
  }
}, true);

window.addEventListener("shitu:logout", async () => {
  try {
    if (isVpsApiConfigured()) await vpsLogout();
    else if (isSupabaseConfigured()) {
      const supabase = await getSupabase();
      await supabase?.auth.signOut();
    }
  } catch {}
  localStorage.removeItem(AUTH_KEY);
});

void boot();
