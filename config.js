/**
 * Public browser configuration for the static GitHub Pages build.
 *
 * SUPABASE_URL and a publishable key (or legacy anon key) are designed to be
 * visible in a browser. Database access is protected by Supabase RLS.
 * NEVER place a service_role key, sb_secret_* key, database password, JWT
 * signing secret, or other private credential in this file.
 */
window.AI_DRAMA_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://oevqyhkifpyazphnumqg.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_clUNIEIkPHKttNvWatHRsA_Vxfpma5U',
  PUBLIC_ARCHIVE_SLUG: 'spring-holding-hands-2026',
});
