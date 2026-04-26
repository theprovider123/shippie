/**
 * Lazy resolution of auth-related env values.
 *
 * AUTH_SECRET — used to HMAC magic-link tokens. Required in production;
 * a deterministic dev-only fallback applies otherwise so contributors
 * can iterate without a secret put.
 */

const DEV_AUTH_SECRET_FALLBACK = 'dev-only-shippie-platform-auth-secret-do-not-use-in-prod-32b';

export interface AuthEnv {
  AUTH_SECRET?: string;
  SHIPPIE_ENV?: string;
}

export function getAuthSecret(env: AuthEnv): string {
  const secret = env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (env.SHIPPIE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production. Run: wrangler secret put AUTH_SECRET');
  }
  return DEV_AUTH_SECRET_FALLBACK;
}
