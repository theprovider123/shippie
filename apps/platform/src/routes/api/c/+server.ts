/**
 * POST /api/c — pin a signed share blob to R2 by content hash.
 *
 * The body is a JSON-serialised ShareBlob (from @shippie/share).
 * We compute sha256(canonical(blob)) as the storage key, upload
 * to PLATFORM_ASSETS bucket under `content/<hash>`, and return
 * `{ hash, url }`. The URL renders a read-only preview at
 * `https://shippie.app/c/<hash>`.
 *
 * 90-day TTL is set via `customMetadata.expires_at`. A future cron
 * sweep removes expired objects (Cloudflare R2 lifecycle rules can
 * also do this). Until then, the preview route checks the metadata
 * on each load and 410s expired content.
 *
 * Privacy posture:
 *   - No account required.
 *   - Bytes go to Shippie's R2 — but the hash is the only key, and
 *     the hash space is 2^256, so URLs cannot be guessed. Browsers
 *     won't index the page (`<meta robots="noindex">` on the preview).
 *   - Idempotent: posting the same blob twice returns the same hash;
 *     R2 dedupes naturally.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canonicalize } from '@shippie/share';

const TTL_DAYS = 90;
const MAX_BLOB_BYTES = 200 * 1024; // 200 KB — the URL-fragment surface
                                    // already covers smaller payloads;
                                    // R2 is the "with photo" pressure
                                    // release.

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = new ArrayBuffer(enc.byteLength);
  new Uint8Array(buf).set(enc);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return bytesToHex(new Uint8Array(digest));
}

export const POST: RequestHandler = async ({ request, platform, url }) => {
  if (!platform?.env.PLATFORM_ASSETS) {
    throw error(503, 'storage binding unavailable');
  }
  const r2 = platform.env.PLATFORM_ASSETS;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'expected JSON body');
  }

  // Minimal shape check — full verification happens at preview time
  // (and the preview shows tampered if the signature fails). Here we
  // just sanity-check the wire shape.
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { v?: number }).v !== 1 ||
    typeof (body as { type?: string }).type !== 'string' ||
    typeof (body as { sig?: string }).sig !== 'string'
  ) {
    throw error(400, 'invalid share blob');
  }

  const canonical = canonicalize(body);
  const bytes = new TextEncoder().encode(canonical);
  if (bytes.byteLength > MAX_BLOB_BYTES) {
    throw error(413, `blob too large (${bytes.byteLength} bytes; max ${MAX_BLOB_BYTES})`);
  }

  const hash = await sha256Hex(canonical);
  const expiresAt = Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000;

  // Idempotent: if the same blob has been posted before, the head call
  // returns its metadata; we just hand back the existing URL with the
  // refreshed expiry (best-effort — we re-PUT to bump TTL).
  await r2.put(`content/${hash}`, bytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      expires_at: String(expiresAt),
      type: (body as { type: string }).type,
      ttl_days: String(TTL_DAYS),
    },
  });

  const liveUrl = `${url.origin}/c/${hash}`;
  return json({
    hash,
    url: liveUrl,
    expires_at: expiresAt,
    ttl_days: TTL_DAYS,
    bytes: bytes.byteLength,
  });
};
