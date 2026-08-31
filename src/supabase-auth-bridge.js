import {
  getSupabase,
  getMyProfile,
  isSupabaseConfigured,
  loginEmailForUsername,
  mirrorSupabaseSessionToLegacy,
} from "./supabase-client.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACCOUNTS_KEY = "shitu-kitchen-accounts-v2";
const MODULES = ["dashboard","inventory","procurement","reservations","preparation","menu","sop","skills","attendance","schedule","reports","remote","settings"];

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
  for (const key of MODULES) {
    const view = data.has(`perm:${key}:view`);
    const edit = data.has(`perm:${key}:edit`);
    permissions[key] = { view, edit: view && edit };
  }
  return permissions;
}

async function broadcastProfileChange(supabase, userId) {
  if (!supabase || !userId) return;
  const channel = supabase.channel(`kitchen-os-user-${userId}`);
  channel.subscribe(async (status) => {
    if (status !== "SUBSCRIBED") return;
    try {
      await channel.send({ type: "broadcast", event: "profile", payload: { userId } });
    } finally {
      setTimeout(() => { void supabase.removeChannel(channel); }, 500);
    }
  });
}

function initialRoute(profile) {
  const permissions = profile?.permissions || {};
  if (profile?.location === "central" && permissions.inventory?.view !== false) return "#inventory";
  if (permissions.dashboard?.view !== false) return "#dashboard";
  const first = MODULES.find((key) => permissions[key]?.view);
  return first ? `#${first}` : "#inventory";
}

async function syncProfiles() {
  const supabase = await getSupabase();
  if (!supabase) return;
  const { data: mine } = await supabase.auth.getUser();
  if (!mine?.user) return;
  const profile = await getMyProfile();
  if (!profile) return;
  await mirrorSupabaseSessionToLegacy(profile);

  if (profile.role !== "admin") return;
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
  if (!isSupabaseConfigured()) return;

  const legacy = (() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
  })();

  // Once Supabase is configured, old hard-coded/local passwords are no longer trusted.
  if (legacy && legacy.provider !== "supabase") localStorage.removeItem(AUTH_KEY);

  const supabase = await getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    if (legacy?.provider === "supabase") localStorage.removeItem(AUTH_KEY);
    return;
  }
  await syncProfiles();
}

document.addEventListener("submit", async (event) => {
  if (!isSupabaseConfigured()) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === "auth-login-form") {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const username = String(data.get("username") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    try {
      const supabase = await getSupabase();
      const email = loginEmailForUsername(username);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await getMyProfile();
      if (!profile?.active) {
        await supabase.auth.signOut();
        throw new Error("ACCOUNT_DISABLED");
      }
      await mirrorSupabaseSessionToLegacy(profile);
      await syncProfiles();
      document.body.classList.remove("auth-locked");
      document.querySelector("#auth-layer")?.remove();
      location.hash = initialRoute(profile);
      location.reload();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
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
    if (next.length < 6) {
      if (message) message.textContent = "Mật khẩu tối thiểu 6 ký tự. · 密碼至少 6 碼。";
      return;
    }
    if (next !== confirmPassword) {
      if (message) message.textContent = "Mật khẩu xác nhận không khớp. · 兩次密碼不一致。";
      return;
    }
    try {
      const supabase = await getSupabase();
      const profile = await getMyProfile();
      const email = loginEmailForUsername(profile.username);
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) throw new Error("WRONG_CURRENT");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      if (message) message.textContent = "Đã đổi mật khẩu. · 密碼已更新。";
      form.reset();
    } catch (error) {
      if (message) message.textContent = error instanceof Error && error.message === "WRONG_CURRENT"
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
      const supabase = await getSupabase();
      const { data: result, error } = await supabase.functions.invoke("admin-users", { body });
      if (error || result?.error) throw new Error(result?.error || error?.message || "ADMIN_USER_FAILED");
      await syncProfiles();
      if (id) await broadcastProfileChange(supabase, id);
      document.querySelector("[data-account-modal]")?.remove();
      location.reload();
    } catch (error) {
      if (message) message.textContent = `Không thể lưu tài khoản. · 帳號儲存失敗。 ${esc(error instanceof Error ? error.message : "")}`;
    }
  }
}, true);

document.addEventListener("click", async (event) => {
  if (!isSupabaseConfigured()) return;

  const logoutButton = event.target.closest(".auth-user-chip button");
  if (logoutButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const supabase = await getSupabase();
    await supabase?.auth.signOut();
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
    const supabase = await getSupabase();
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete", id: deleteButton.dataset.accountDelete },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "DELETE_FAILED");
    await syncProfiles();
    await broadcastProfileChange(supabase, deleteButton.dataset.accountDelete);
    document.querySelector("[data-account-modal]")?.remove();
    location.reload();
  } catch (error) {
    alert(`Không thể xóa tài khoản. · 帳號刪除失敗。 ${error instanceof Error ? error.message : ""}`);
  }
}, true);

window.addEventListener("shitu:logout", async () => {
  if (!isSupabaseConfigured()) return;
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
  localStorage.removeItem(AUTH_KEY);
});

void boot();
