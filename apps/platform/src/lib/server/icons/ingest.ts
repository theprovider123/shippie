/**
 * App icon ingestion.
 *
 * Makers used to store an arbitrary external `icon_url` (and cleanUrl even
 * accepted http:). That hotlink is a privacy beacon (the maker's host sees a
 * hit every time the drawer renders), a mixed-content risk, and a broken-image
 * risk. This module fetches the icon once, validates it, stores it in R2, and
 * returns a same-origin URL served by /__shippie/icons. No third-party hotlinks.
 *
 * Variant generation (64/128/256/512) needs the Cloudflare Images binding,
 * which isn't wired yet — we store the validated original same-origin and let
 * the renderer downscale; physical variants are a follow-up. SVG is deferred
 * until a sanitizer is in place (an unsanitized SVG is an XSS vector).
 */
import type { R2Bucket } from '@cloudflare/workers-types';

/** Raster types we accept. SVG is intentionally excluded (needs sanitizing). */
export const ALLOWED_ICON_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export const MAX_ICON_BYTES = 512 * 1024; // 512 KB

export type IconIngestResult =
  | { ok: true; url: string; key: string; contentType: string }
  | { ok: false; reason: string };

/** Same-origin path an ingested icon is served from (distinct from the PWA
 * `/__shippie/icons/[size]` route to avoid a dynamic-segment conflict). */
export function ingestedIconPath(appId: string, ext: string): string {
  return `/__shippie/app-icons/${appId}/icon.${ext}`;
}

/** R2 key an ingested icon is stored under. */
export function ingestedIconKey(appId: string, ext: string): string {
  return `app-icons/${appId}/icon.${ext}`;
}

/** True only for an https:// URL that isn't already a same-origin ingested icon. */
export function isIngestableIconUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.startsWith('/__shippie/app-icons/')) return false; // already ingested
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate a fetched icon's content-type + size. */
export function validateIconResponse(
  contentType: string | null,
  byteLength: number,
): { ok: true; ext: string; contentType: string } | { ok: false; reason: string } {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'image/svg+xml') {
    return { ok: false, reason: 'svg_not_supported' };
  }
  const ext = ALLOWED_ICON_TYPES[type];
  if (!ext) return { ok: false, reason: 'unsupported_type' };
  if (byteLength <= 0) return { ok: false, reason: 'empty' };
  if (byteLength > MAX_ICON_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, ext, contentType: type };
}

/**
 * Fetch → validate → store an external icon in R2, returning a same-origin URL.
 * `fetchImpl` is injectable for testing.
 */
export async function ingestIcon(input: {
  r2: R2Bucket;
  appId: string;
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<IconIngestResult> {
  if (!isIngestableIconUrl(input.url)) {
    return { ok: false, reason: 'must_be_https' };
  }
  const doFetch = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(input.url, { redirect: 'follow' });
  } catch {
    return { ok: false, reason: 'fetch_failed' };
  }
  if (!res.ok) return { ok: false, reason: `fetch_status_${res.status}` };

  const bytes = new Uint8Array(await res.arrayBuffer());
  const validation = validateIconResponse(res.headers.get('content-type'), bytes.byteLength);
  if (!validation.ok) return validation;

  const key = ingestedIconKey(input.appId, validation.ext);
  await input.r2.put(key, bytes, {
    httpMetadata: { contentType: validation.contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return {
    ok: true,
    url: ingestedIconPath(input.appId, validation.ext),
    key,
    contentType: validation.contentType,
  };
}
