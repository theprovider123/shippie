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
 * Spec v5 §4 (GitHub as primary integration).
 */
import { createSign } from 'node:crypto';

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
 * The token grants repo access for ~1 hour.
 */
export async function getInstallationToken(installationId: number): Promise<string> {
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
  return data.token;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
