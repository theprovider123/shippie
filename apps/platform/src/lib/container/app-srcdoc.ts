/**
 * Container — fixture iframe HTML generator.
 *
 * The container prefers loading apps via:
 *   1. `app.devUrl` — Vite dev server in development
 *   2. inlined package files (codex's commons archive flow)
 *   3. this fixture — a tiny placeholder that explains "no app loaded"
 *      and offers a single bridge call so the shell stays interactive
 *      even before real assets exist.
 *
 * Pure function. Keeps heredoc HTML out of the Svelte file.
 */

import type { ContainerApp, PackageFileCache } from './state';

export function appPackageSrcdoc(
  app: ContainerApp,
  packageFiles: Record<string, PackageFileCache> | undefined,
): string {
  const packageEntryHtml = packageFiles?.[app.entry]?.text;
  if (packageEntryHtml) return inlinePackageAssets(packageEntryHtml, app.entry, packageFiles ?? {});

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; background: #fffaf2; color: #211d18; }
    main { min-height: 100vh; padding: 24px; display: grid; align-content: center; justify-items: start; gap: 12px; }
    h1 { margin: 0; font-size: 22px; }
    p { margin: 0; color: #5f554a; line-height: 1.5; max-width: 38ch; }
    button { border: 1px solid #211d18; background: transparent; color: #211d18; border-radius: 999px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
    .tag { display: inline-flex; border: 1px solid ${app.accent}; color: ${app.accent}; border-radius: 999px; padding: 3px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <main>
    <span class="tag">sandboxed ${app.labelKind.toLowerCase()} app</span>
    <h1>${app.name} hasn't loaded any code yet</h1>
    <p>Install a package archive or point this app at a dev URL to see real content. Until then, only the capability bridge is active.</p>
    <button data-action="ping">Test bridge</button>
  </main>
  <script>
    const appId = '${app.id}';
    document.querySelector('[data-action="ping"]').addEventListener('click', () => {
      parent.postMessage({
        protocol: 'shippie.bridge.v1',
        id: appId + '_ping_' + Date.now(),
        appId,
        capability: 'app.info',
        method: 'info',
        payload: {},
      }, '*');
    });
  ${'</scr' + 'ipt>'}
</body>
</html>`;
}

export function appSrcdoc(
  app: ContainerApp,
  packageEntryHtml: string | undefined,
): string {
  return packageEntryHtml
    ? inlinePackageAssets(packageEntryHtml, app.entry, {
        [app.entry]: {
          mimeType: 'text/html; charset=utf-8',
          text: packageEntryHtml,
          dataUrl: '',
        },
      })
    : appPackageSrcdoc(app, undefined);
}

export function inlinePackageAssets(
  html: string,
  entryPath: string,
  packageFiles: Record<string, PackageFileCache>,
): string {
  const baseDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/') + 1) : '';
  return rewritePackageAssetReferences(
    html
    .replace(
      /<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*?)>/gi,
      (tag, before: string, href: string, after: string) => {
        if (!/\brel=["']?stylesheet["']?/i.test(`${before} ${after}`)) return tag;
        const css = packageFiles[resolvePackageAssetPath(href, baseDir)]?.text;
        return css === undefined ? tag : `<style data-shippie-inlined="${escapeHtml(href)}">\n${css}\n</style>`;
      },
    )
    .replace(
      /<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
      (tag, before: string, src: string, after: string) => {
        const js = packageFiles[resolvePackageAssetPath(src, baseDir)]?.text;
        return js === undefined
          ? tag
          : `<script${before}${after} data-shippie-inlined="${escapeHtml(src)}">\n${js}\n${'</scr' + 'ipt>'}`;
      },
    )
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (tag, attrs: string, css: string) => `<style${attrs}>${rewriteCssPackageUrls(css, baseDir, (path) => packageFiles[path]?.dataUrl)}</style>`,
    ),
    entryPath,
    (path) => packageFiles[path]?.dataUrl,
  );
}

export function rewritePackageAssetReferences(
  html: string,
  entryPath: string,
  resolveAssetUrl: (path: string) => string | undefined,
): string {
  const baseDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/') + 1) : '';
  return html
    .replace(
      /\b(src|poster|href)=["']([^"']+)["']/gi,
      (attr, name: string, raw: string) => {
        const url = resolveAssetUrl(resolvePackageAssetPath(raw, baseDir));
        if (!url) return attr;
        return `${name}="${escapeHtml(url)}"`;
      },
    )
    .replace(
      /\bsrcset=["']([^"']+)["']/gi,
      (attr, raw: string) => {
        const rewritten = raw
          .split(',')
          .map((candidate) => {
            const parts = candidate.trim().split(/\s+/);
            const asset = parts[0];
            if (!asset) return candidate;
            const url = resolveAssetUrl(resolvePackageAssetPath(asset, baseDir));
            return url ? [url, ...parts.slice(1)].join(' ') : candidate.trim();
          })
          .join(', ');
        return `srcset="${escapeHtml(rewritten)}"`;
      },
    )
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (tag, attrs: string, css: string) => `<style${attrs}>${rewriteCssPackageUrls(css, baseDir, resolveAssetUrl)}</style>`,
    );
}

export function resolvePackageAssetPath(raw: string, baseDir: string): string {
  try {
    const url = new URL(raw, 'https://package.local/');
    if (url.origin !== 'https://package.local') return raw;
    raw = url.pathname.replace(/^\/+/, '');
  } catch {
    // Relative path — handled below.
  }

  if (raw.startsWith('app/')) return normalizePackageAssetPath(raw);
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
    return normalizePackageAssetPath(`${baseDir}${raw.replace(/^\/+/, '')}`);
  }
  return normalizePackageAssetPath(`${baseDir}${raw}`);
}

function normalizePackageAssetPath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function rewriteCssPackageUrls(
  css: string,
  baseDir: string,
  resolveAssetUrl: (path: string) => string | undefined,
): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote: string, raw: string) => {
    if (raw.startsWith('data:') || raw.startsWith('#')) return match;
    const url = resolveAssetUrl(resolvePackageAssetPath(raw, baseDir));
    if (!url) return match;
    const q = quote || '"';
    return `url(${q}${url}${q})`;
  });
}
