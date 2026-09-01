import {
  getMyProfile,
  isSupabaseConfigured,
  mirrorSupabaseSessionToLegacy,
} from "./supabase-client.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const RELOAD_GUARD = "shitu-inventory-permission-refresh-v1";

function readLegacySession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}

function comparable(session) {
  if (!session) return "";
  return JSON.stringify({
    id: session.id || "",
    accountRole: session.accountRole || session.role || "",
    location: session.location || "",
    inventory: session.permissions?.inventory || {},
    provider: session.provider || "",
  });
}

async function refreshInventoryPermissionSession({ reloadOnChange = false } = {}) {
  if (!isSupabaseConfigured()) return false;
  const before = readLegacySession();
  if (!before?.id || before.provider !== "supabase") return false;

  try {
    const profile = await getMyProfile();
    if (!profile?.id || !profile.active) return false;

    // v11 grants inventory view/edit to site managers and all-site managers.
    // Normalize the mirrored browser session immediately after a migration or
    // account update so the UI does not keep an older permission snapshot.
    const normalized = {
      ...profile,
      permissions: {
        ...(profile.permissions || {}),
        inventory:
          profile.role === "manager" && ["central", "fuxing", "yongji", "all"].includes(profile.location)
            ? { view: true, edit: true }
            : (profile.permissions?.inventory || {}),
      },
    };

    const expected = {
      id: normalized.id,
      accountRole: normalized.role,
      location: normalized.location,
      permissions: normalized.permissions,
      provider: "supabase",
    };

    const changed = comparable(before) !== comparable(expected);
    await mirrorSupabaseSessionToLegacy(normalized);

    if (changed) {
      window.dispatchEvent(new CustomEvent("shitu:auth-synced"));
      if (reloadOnChange && sessionStorage.getItem(RELOAD_GUARD) !== "1") {
        sessionStorage.setItem(RELOAD_GUARD, "1");
        location.reload();
      }
    } else {
      sessionStorage.removeItem(RELOAD_GUARD);
    }
    return changed;
  } catch {
    return false;
  }
}

void refreshInventoryPermissionSession({ reloadOnChange: true });

window.addEventListener("shitu:auth-synced", () => {
  void refreshInventoryPermissionSession();
});

window.addEventListener("focus", () => {
  void refreshInventoryPermissionSession();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshInventoryPermissionSession();
});
