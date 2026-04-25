/**
 * Static file server for cached app deploys.
 *
 * Devices on the local network can install Shippie apps from the Hub
 * even when offline — we cache each app's HTML / JS / CSS / icons
 * on disk after the first fetch from `*.shippie.app`. Cache layout:
 *
 *   <cacheRoot>/
 *     apps/
 *       <slug>/
 *         <version>/
 *           index.html
 *           static/...
 *
 * The Hub serves `<slug>.hub.local` (Host: <slug>.hub.local) by mapping
 * to `<cacheRoot>/apps/<slug>/<latest-version>/...`. Falls back to a
 * "not cached" response if the slug isn't in the cache.
 *
 * This is internal-network only — there is no source-of-truth here.
 * The cloud is still the SoT for app builds; the Hub is a read-through
 * cache.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

export interface StaticOptions {
  /** Root directory for cached app builds. */
  cacheRoot: string;
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
};

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

/**
 * Resolve a slug + relative path to an absolute file under cacheRoot.
 * Refuses any path that escapes the slug directory (zip-slip / dot-dot).
 */
export async function resolveAppFile(
  cacheRoot: string,
  slug: string,
  relPath: string,
): Promise<string | null> {
  if (!isSafeSlug(slug)) return null;
  const slugDir = join(cacheRoot, 'apps', slug);
  if (!existsSync(slugDir)) return null;

  const versions = (await readdir(slugDir)).filter((v) => /^[a-zA-Z0-9._-]+$/.test(v));
  if (versions.length === 0) return null;
  // Highest sortable version wins. Builds typically use ISO timestamps
  // or semver, both of which sort lexically the way we want.
  versions.sort();
  const latest = versions[versions.length - 1]!;

  const raw = relPath || 'index.html';
  // Catch dot-dot before normalize() collapses it.
  if (/(^|\/)\.\.(\/|$)/.test(raw)) return null;
  const cleaned = normalize('/' + raw).replace(/^\/+/, '');
  if (cleaned.includes('..')) return null;
  const full = join(slugDir, latest, cleaned);
  // Final guard: must still be under the slug dir.
  if (!full.startsWith(slugDir)) return null;
  return full;
}

export async function serveAppFile(
  cacheRoot: string,
  slug: string,
  relPath: string,
): Promise<Response> {
  const path = await resolveAppFile(cacheRoot, slug, relPath);
  if (!path) {
    return new Response(notCachedHtml(slug), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      // index fallback for directories.
      const idx = await resolveAppFile(cacheRoot, slug, join(relPath || '', 'index.html'));
      if (!idx) throw new Error('not a file');
      return new Response(await readFile(idx), {
        headers: { 'content-type': mimeFor(idx) },
      });
    }
    return new Response(await readFile(path), {
      headers: { 'content-type': mimeFor(path) },
    });
  } catch {
    return new Response(notCachedHtml(slug), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug);
}

export function extractSlugFromHost(host: string): string | null {
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  // <slug>.hub.local
  const m = /^([a-z0-9][a-z0-9-]*)\.hub\.local$/.exec(hostname);
  return m?.[1] ?? null;
}

function notCachedHtml(slug: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Not cached</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
max-width:480px;margin:80px auto;padding:0 20px;color:#14120F}</style></head>
<body><h1>App not cached on this Hub</h1>
<p>The Shippie Hub on this network hasn't seen <code>${escapeHtml(
    slug,
  )}</code> yet. Plug in once with internet to fetch it from <code>${escapeHtml(
    slug,
  )}.shippie.app</code>, then it'll be available offline.</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
