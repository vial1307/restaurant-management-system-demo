import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_CONFIGURED } from "./supabase-config.js";

let clientPromise = null;

export function isSupabaseConfigured() {
  return SUPABASE_CONFIGURED;
}

export async function getSupabase() {
  if (!SUPABASE_CONFIGURED) return null;
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "shitu-supabase-auth",
        },
      }));
  }
  return clientPromise;
}

export function loginEmailForUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(normalized)) {
    throw new Error("USERNAME_FORMAT");
  }
  return `${normalized}@staff.shitu.local`;
}

export async function getMyProfile() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,role,location,active,permissions,preferred_language")
    .eq("id", authData.user.id)
    .single();
  if (error) throw error;
  return {
    ...data,
    preferred_language:
      authData.user.user_metadata?.preferred_language ||
      data.preferred_language ||
      "vi",
  };
}

export async function mirrorSupabaseSessionToLegacy(profile) {
  if (!profile) return;
  const authRole = profile.role === "admin" ? "admin" : profile.role === "central" ? "central" : "branch";
  localStorage.setItem("shitu-kitchen-auth-v1", JSON.stringify({
    id: profile.id,
    username: profile.username,
    name: profile.display_name,
    role: authRole,
    accountRole: profile.role,
    location: profile.location,
    permissions: profile.permissions || {},
    preferredLanguage: profile.preferred_language || "vi",
    provider: "supabase",
  }));
}
