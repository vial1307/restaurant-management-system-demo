import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_CONFIGURED } from "./supabase-config.js";

let clientPromise = null;
let profilePromise = null;
let profileCache = null;
let profileCacheAt = 0;
const PROFILE_CACHE_MS = 5000;

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

export function invalidateMyProfileCache() {
  profileCache = null;
  profileCacheAt = 0;
  profilePromise = null;
}

export async function getMyProfile({ force = false } = {}) {
  const now = Date.now();
  if (!force && profileCache && now - profileCacheAt < PROFILE_CACHE_MS) return profileCache;
  if (!force && profilePromise) return profilePromise;

  profilePromise = (async () => {
    const supabase = await getSupabase();
    if (!supabase) return null;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const authUser = sessionData?.session?.user;
    if (sessionError || !authUser) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,display_name,role,location,active,permissions,preferred_language")
      .eq("id", authUser.id)
      .single();
    if (error) throw error;

    const profile = {
      ...data,
      preferred_language:
        authUser.user_metadata?.preferred_language ||
        data.preferred_language ||
        "vi",
    };
    profileCache = profile;
    profileCacheAt = Date.now();
    return profile;
  })();

  try {
    return await profilePromise;
  } finally {
    profilePromise = null;
  }
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
