/**
 * GET /c/[hash] — read-only preview of a pinned share blob.
 *
 * Fetches the blob from R2 by its content hash, verifies the
 * signature (just enough to display a verification badge), and hands
 * the parsed payload to the page for rendering. 410s if the object's
 * `expires_at` metadata has passed; 404s if the hash isn't found.
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyBlob, type ShareBlob } from '@shippie/share';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
  if (!platform?.env.PLATFORM_ASSETS) {
    throw error(503, 'storage binding unavailable');
  }
  const r2 = platform.env.PLATFORM_ASSETS;
  const obj = await r2.get(`content/${params.hash}`);
  if (!obj) throw error(404, 'not found');

  const expiresAtRaw = obj.customMetadata?.expires_at;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null;
  if (expiresAt !== null && Date.now() > expiresAt) {
    throw error(410, 'this link has expired');
  }

  let blob: ShareBlob;
  try {
    blob = JSON.parse(await obj.text()) as ShareBlob;
  } catch {
    throw error(500, 'corrupt blob');
  }

  const verification = await verifyBlob(blob);

  // Platform-controlled cache: 5-minute TTL is fine — the blob is
  // immutable (content-addressed), the only thing that changes is the
  // expiry window, and the preview page is light.
  setHeaders({
    'cache-control': 'public, max-age=300',
    'x-robots-tag': 'noindex, nofollow',
  });

  return {
    hash: params.hash,
    blob,
    verified: verification.valid,
    verifyReason: verification.valid ? null : verification.reason,
    expires_at: expiresAt,
  };
};
