/**
 * Contact Email Constants
 * Centralized email addresses for the application
 * 
 * SECURITY NOTE: These emails are public-facing and safe to expose in client code.
 * For sensitive admin/internal emails, use environment variables or server-side configuration.
 */

// Public support/contact email (safe to expose in client)
export const SUPPORT_EMAIL = 'hello@nomli.cc';

// Official account email (used for verification badges - safe to expose)
export const OFFICIAL_ACCOUNT_EMAIL = 'hello@nomli.cc';

// Official in‑app handle (verified Nomli Mingle account)
export const OFFICIAL_ACCOUNT_HANDLE = '@nomlimingle_hq';

// Official profile ID (Supabase profiles.id) for opening chat directly
// This is a public identifier, safe to embed in client code.
export const OFFICIAL_ACCOUNT_ID = 'fc56974a-6eed-48ec-86a3-349e739c6b58';

// Note: Admin emails and internal emails should be stored in:
// - Environment variables (for Edge Functions)
// - Server-side configuration
// - NOT in client-side code

