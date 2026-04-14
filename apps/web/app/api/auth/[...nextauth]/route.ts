/**
 * Auth.js v5 route handler — exposes all /api/auth/* endpoints.
 *
 * Auth.js handles:
 *   GET  /api/auth/providers           → list of enabled providers
 *   POST /api/auth/signin/:provider    → initiate sign-in
 *   GET  /api/auth/callback/:provider  → OAuth callback
 *   GET  /api/auth/verify-request      → email sent confirmation
 *   POST /api/auth/signout             → sign out
 *   GET  /api/auth/session             → current session
 *   GET  /api/auth/csrf                → CSRF token
 */
export { GET, POST } from '@/lib/auth';

/**
 * The nodemailer email provider and Drizzle adapter both use Node APIs,
 * so this handler must run on the Node runtime, not the Edge runtime.
 */
export const runtime = 'nodejs';

/**
 * Force dynamic rendering. Without this, Next.js tries to statically
 * analyze the route at dev-server boot, which triggers PGlite
 * initialization in a pre-render context that can't share state with
 * real request handlers. The result is a WASM "Aborted()" error on the
 * OAuth callback.
 *
 * Spec v6 §6 (auth is always request-time, never pre-rendered).
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-no-store';
