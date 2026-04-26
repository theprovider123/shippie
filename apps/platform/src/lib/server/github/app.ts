/**
 * GitHub App authentication helpers — Worker-friendly.
 *
 * Ports apps/web/lib/github/app.ts but uses Web Crypto (SubtleCrypto)
 * instead of node:crypto so it runs in the Cloudflare Worker runtime.
 *
 * RS256 signing: imports the PEM private key as a CryptoKey and signs the
 * JWT header.payload with RSA-SHA256. The base64-encoded private key
 * arrives in the env var the same way it does on the legacy Vercel side.
 *
 * Tokens are NOT cached cross-request in this implementation — the Worker
 * isolate may live longer than a single request, but D1/KV calls are cheap.
 * Add an in-memory map if a hot deploy path needs more throughput.
 */

interface MintArgs {
  appId: string;
  privateKey: string; // PEM string OR base64 of the PEM
  installationId: number;
}

const PEM_HEADER = '-----BEGIN PRIVATE KEY-----';

async function importPrivateKey(raw: string): Promise<CryptoKey> {
  // Accept either raw PEM (multiline with headers) OR base64-of-PEM.
  let pem = raw.trim();
  if (!pem.startsWith(PEM_HEADER)) {
    // Assume base64-encoded PEM — decode to UTF-8 PEM.
    try {
      pem = atob(pem);
    } catch {
      throw new Error('GITHUB_APP_PRIVATE_KEY is neither PEM nor base64-PEM');
    }
  }

  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateAppJwt(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: appId, iat: now - 60, exp: now + 540 }));
  const data = `${header}.${payload}`;

  const key = await importPrivateKey(privateKey);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${base64url(new Uint8Array(sig))}`;
}

export async function getInstallationToken(args: MintArgs): Promise<string> {
  const jwt = await generateAppJwt(args.appId, args.privateKey);
  const res = await fetch(
    `https://api.github.com/app/installations/${args.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'shippie-platform/1.0',
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`installation_token_failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}
