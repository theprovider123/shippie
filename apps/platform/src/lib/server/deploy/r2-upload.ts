/**
 * R2 upload helpers — direct binding access to platform.env.APPS.
 *
 * Replaces apps/web/lib/deploy/index.ts:getStorage() + buildCfStorage(),
 * which used @shippie/cf-storage's CfR2 over HTTPS. Native R2 bindings
 * are O(ms) — no signed-request HMAC, no JSON-RPC roundtrip.
 *
 * Key shape stays the same: `apps/{slug}/v{version}/{path}`
 *
 * The wrapper rewriter (Phase 5) reads from this same key shape, so the
 * runtime contract is preserved across the cf-storage retirement.
 */
import type { R2Bucket } from '@cloudflare/workers-types';

export interface UploadEntry {
  /** Path relative to the bucket prefix, leading slash optional. */
  path: string;
  body: Uint8Array;
}

export interface UploadResult {
  manifest: Array<{ path: string; size: number }>;
  totalBytes: number;
}

/**
 * Upload every file in `files` to `apps/{slug}/v{version}/{path}` in the
 * APPS R2 bucket. Returns a manifest suitable for inserting into
 * `deploy_artifacts.manifest` JSON.
 *
 * Sequential rather than concurrent to keep memory bounded and stay
 * well under R2's 1000-req/s rate (a normal app is 50-200 files).
 */
export async function uploadFilesToR2(
  bucket: R2Bucket,
  slug: string,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<UploadResult> {
  const r2Prefix = `apps/${slug}/v${version}`;
  const manifest: Array<{ path: string; size: number }> = [];
  let totalBytes = 0;

  for (const [path, body] of files) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const key = `${r2Prefix}${cleanPath}`;
    const contentType = guessContentType(path);

    await bucket.put(key, body, {
      httpMetadata: { contentType },
    });

    manifest.push({ path: cleanPath, size: body.byteLength });
    totalBytes += body.byteLength;
  }

  return { manifest, totalBytes };
}

/**
 * Best-effort content-type sniffing by extension. Mirrors the runtime
 * worker's reverse mapping so re-uploads are byte-identical to fresh
 * deploys.
 */
function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html; charset=utf-8';
    case 'js':
    case 'mjs':
      return 'application/javascript; charset=utf-8';
    case 'css':
      return 'text/css; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'ico':
      return 'image/x-icon';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'ttf':
      return 'font/ttf';
    case 'txt':
      return 'text/plain; charset=utf-8';
    case 'xml':
      return 'application/xml';
    case 'wasm':
      return 'application/wasm';
    case 'webmanifest':
      return 'application/manifest+json';
    default:
      return 'application/octet-stream';
  }
}
