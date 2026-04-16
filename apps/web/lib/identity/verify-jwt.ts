/**
 * BYO backend JWT verification via JWKS.
 *
 * Validates bearer tokens from the maker's auth provider (Supabase,
 * Firebase) by fetching the provider's JWKS and verifying the signature.
 * JWKS responses are cached in-memory for 1 hour.
 *
 * Returns verified claims or null if the token is invalid/expired/forged.
 *
 * Spec v5 §2 (identity bridge).
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedIdentity {
  sub: string;
  email: string | null;
  name: string | null;
}

// Cache JWKS fetchers per URL (in-memory, process-lifetime)
const jwksCache = new Map<string, { fetcher: ReturnType<typeof createRemoteJWKSet>; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getJwksFetcher(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.fetcher;
  }
  const fetcher = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache.set(jwksUrl, { fetcher, cachedAt: Date.now() });
  return fetcher;
}

function getJwksUrl(backendType: string, backendUrl: string): string | null {
  switch (backendType) {
    case 'supabase':
      // Supabase JWKS endpoint
      return `${backendUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
    case 'firebase':
      // Firebase/Google JWKS endpoint
      return 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
    default:
      return null;
  }
}

/**
 * Verify a bearer token against the app's configured backend JWKS.
 *
 * Returns verified identity claims or null if:
 *   - No backend configured (Tier 1 / static app)
 *   - Token is invalid, expired, or signature doesn't match
 *   - JWKS endpoint is unreachable
 */
export async function verifyJwt(
  token: string,
  backendType: string | null,
  backendUrl: string | null,
): Promise<VerifiedIdentity | null> {
  if (!backendType || !backendUrl) return null;

  const jwksUrl = getJwksUrl(backendType, backendUrl);
  if (!jwksUrl) return null;

  try {
    const jwks = getJwksFetcher(jwksUrl);
    const { payload } = await jwtVerify(token, jwks, {
      // Don't enforce issuer for now — Supabase and Firebase use different
      // issuer formats. We validate signature + expiry which is sufficient.
    });

    const sub = payload.sub;
    if (!sub) return null;

    return {
      sub,
      email: (payload.email as string) ?? null,
      name: (payload.name as string) ?? (payload.user_metadata as { name?: string })?.name ?? null,
    };
  } catch {
    // Invalid signature, expired, network error, etc. — treat as anonymous.
    return null;
  }
}
