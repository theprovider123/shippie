/**
 * URL fragment encoding for share blobs.
 *
 * Uses `#shippie-import=<base64url-of-gzipped-blob>` so the blob never
 * leaves the browser — fragments aren't sent to servers. Compression
 * keeps small blobs small (recipes are JSON-heavy + repetitive).
 *
 * For blobs that don't fit comfortably (≥ ~1.8 KB compressed), pass the
 * threshold check and use Web Share API or the future R2-pinned-link
 * surface instead — single-frame QR codes max out around 2.9 KB.
 */
import {
  base64urlToBytes,
  bytesToBase64url,
  type ShareBlob,
} from './blob.ts';

const FRAGMENT_KEY = 'shippie-import';
/** Practical cap so the resulting QR fits at error-correction M. */
export const MAX_FRAGMENT_BYTES = 1800;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return bytes; // graceful fallback — older runtimes; URLs just longer
  }
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    return bytes;
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Pack a signed blob into a URL-safe base64url+gzip string. */
export async function encodeBlobToFragment(blob: ShareBlob): Promise<string> {
  const json = JSON.stringify(blob);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzip(bytes);
  return bytesToBase64url(compressed);
}

/** Reverse: take the fragment string, return the blob (no signature check). */
export async function decodeFragmentToBlob(fragment: string): Promise<ShareBlob> {
  const compressed = base64urlToBytes(fragment);
  const decompressed = await gunzip(compressed);
  const json = new TextDecoder().decode(decompressed);
  return JSON.parse(json) as ShareBlob;
}

/**
 * Produce the full share URL. `baseUrl` is typically the maker
 * subdomain root (e.g. `https://recipe.shippie.app/`); the blob lands
 * in the fragment so it never reaches a server.
 */
export async function buildShareUrl(blob: ShareBlob, baseUrl: string): Promise<string> {
  const fragment = await encodeBlobToFragment(blob);
  // Strip any existing fragment from baseUrl, then append.
  const cleanBase = baseUrl.split('#')[0]!;
  return `${cleanBase}#${FRAGMENT_KEY}=${fragment}`;
}

/**
 * If the current location's hash carries a `shippie-import=…` value,
 * decode it. Returns null if absent. Pure read — does not mutate
 * window.location.
 */
export async function readImportFragment(href: string): Promise<ShareBlob | null> {
  const hashIdx = href.indexOf('#');
  if (hashIdx < 0) return null;
  const hash = href.slice(hashIdx + 1);
  // Fragment can be `key=val` or just `val` after the prefix.
  const params = new URLSearchParams(hash);
  const fragment = params.get(FRAGMENT_KEY);
  if (!fragment) return null;
  try {
    return await decodeFragmentToBlob(fragment);
  } catch {
    return null;
  }
}

/**
 * Strip the import fragment from the URL after consumption. Apps call
 * this once they've shown the import card so reload doesn't re-prompt.
 */
export function clearImportFragment(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.hash.includes(FRAGMENT_KEY)) {
    history.replaceState(null, '', url.pathname + url.search);
  }
}

/**
 * Quick check: would this blob fit in a single-frame QR? Returns the
 * encoded fragment size in bytes so the caller can show "too big to
 * share by QR — use AirDrop instead" gracefully.
 */
export async function fragmentFitsInQr(blob: ShareBlob): Promise<{
  fits: boolean;
  bytes: number;
}> {
  const fragment = await encodeBlobToFragment(blob);
  const bytes = fragment.length; // base64url char count ≈ byte count
  return { fits: bytes <= MAX_FRAGMENT_BYTES, bytes };
}
