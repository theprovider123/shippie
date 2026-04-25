/**
 * Short invite URL helpers.
 *
 * Generates a compact lowercase-base32 short code and maps it to a long
 * invite token in KV. The GET handler at /i/[code] consumes this mapping.
 *
 * We use a dedicated KV accessor here (rather than importing
 * `lib/deploy/kv.ts`) so the access layer stays independent of the
 * deploy pipeline. Under the hood it still uses the same DevKv adapter
 * over the shared `.shippie-dev-state/kv` directory, which will be
 * swapped for a real Cloudflare KV binding when the control-plane
 * spine lands.
 */
import { DevKv, getDevKvDir, type KvStore } from '@shippie/dev-storage';

let cachedKv: KvStore | null = null;

function getShortLinkKv(): KvStore {
  if (cachedKv) return cachedKv;
  cachedKv = new DevKv(getDevKvDir());
  return cachedKv;
}

/** lowercase base32 alphabet (Crockford-ish, no l/o to avoid lookalikes). */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Generate an 8-char lowercase base32-ish short code. */
export function generateShortCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

const KV_PREFIX = 'i:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Persist a short code → long token mapping. Picks an expiry TTL based on
 * the invite expiry (if supplied) or a 30-day default. Retries up to 3
 * times on code collision.
 */
export async function createShortLink(input: {
  token: string;
  expiresAt?: Date | null;
}): Promise<{ code: string }> {
  const kv = getShortLinkKv();
  const ttl = input.expiresAt
    ? Math.max(60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000))
    : DEFAULT_TTL_SECONDS;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateShortCode();
    const existing = await kv.get(`${KV_PREFIX}${code}`);
    if (existing) continue;
    await kv.put(`${KV_PREFIX}${code}`, input.token, { expirationTtl: ttl });
    return { code };
  }
  // Exceedingly unlikely (32^8 ≈ 1e12 codes). Fall through with last attempt.
  const code = generateShortCode();
  await kv.put(`${KV_PREFIX}${code}`, input.token, { expirationTtl: ttl });
  return { code };
}

/** Resolve a short code to its long token, or null if missing/expired. */
export async function resolveShortLink(code: string): Promise<string | null> {
  const kv = getShortLinkKv();
  return kv.get(`${KV_PREFIX}${code}`);
}
