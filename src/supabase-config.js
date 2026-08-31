// Public client configuration for GitHub Pages.
// The publishable key is safe to expose in browser code when RLS is enabled.
// NEVER put a Supabase secret key / service_role key in this file.
export const SUPABASE_URL = "";
export const SUPABASE_PUBLISHABLE_KEY = "";

export const SUPABASE_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") || SUPABASE_PUBLISHABLE_KEY.split(".").length === 3);
