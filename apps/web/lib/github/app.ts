/**
 * GitHub App authentication helpers.
 *
 * Uses a GitHub App private key + app ID to generate JWTs for
 * installation token requests. Installation tokens are short-lived
 * (1 hour) and grant access to the repos the user installed the app on.
 *
 * Requires env vars:
 *   GITHUB_APP_ID
 *   GITHUB_APP_PRIVATE_KEY (PEM, base64-encoded)
 *
 * Installation tokens are cached per-installation for ~50 minutes. Tokens
 * live ~1h upstream; caching until 10 minutes before expiry means concurrent
 * deploys on the same installation share a token instead of burning a
 * GitHub API call each. The cache is per-instance only — on Fluid Compute
 * that's still a large hit-rate win because instances are reused across
 * requests; a shared store (Upstash etc.) is a later optimization.
 *
 * Spec v5 §4 (GitHub as primary integration).
 */
import { createSign } from 'node:crypto';

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, CachedToken>();
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes (tokens live 60, leave 10 of headroom)

function loadAppCredentials() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyB64 = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKeyB64) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set');
  }
  return { appId, privateKey: Buffer.from(privateKeyB64, 'base64').toString('utf8') };
}

/**
 * Generate a JWT for the GitHub App (valid 10 minutes).
 * Used to request installation tokens.
 */
export function generateAppJwt(): string {
  const { appId, privateKey } = loadAppCredentials();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 600 }));

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = base64url(signer.sign(privateKey));

  return `${header}.${payload}.${signature}`;
}

/**
 * Get an installation token for a specific GitHub App installation.
 * Returns a cached token when one is still fresh; otherwise mints a new
 * one via the GitHub API. Tokens grant repo access for ~1 hour.
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  const jwt = generateAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub installation token failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };

  tokenCache.set(installationId, { token: data.token, expiresAt: now + TOKEN_TTL_MS });
  return data.token;
}

/** Test helper — not part of the public API. */
export function __clearInstallationTokenCache(): void {
  tokenCache.clear();
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
