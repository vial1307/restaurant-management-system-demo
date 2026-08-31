// Public client configuration for GitHub Pages.
// The publishable key is safe to expose in browser code when RLS is enabled.
// NEVER put a Supabase secret key / service_role key in this file.
export const SUPABASE_URL = "https://zqbpeizgxcaxrtpsujlr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VMJOEhq8ngTVjEeeYQj_5g_VeNdwJ36";

// Keep authentication migration disabled until schema.sql is applied and the first admin is bootstrapped.
export const SUPABASE_ENABLED = false;

export const SUPABASE_CONFIGURED =
  SUPABASE_ENABLED &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") || SUPABASE_PUBLISHABLE_KEY.split(".").length === 3);
