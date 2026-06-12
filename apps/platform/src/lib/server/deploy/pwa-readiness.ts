import type { ShippieJsonLite } from './manifest';
import type { PwaReadinessReason, PwaReadinessReport } from '$lib/types/pwa-readiness';

const DEFAULT_TIMEOUT_MS = 3500;

export async function probeWrappedUrlPwaReadiness(
  upstreamUrl: string,
  opts: { fetchImpl?: typeof fetch; now?: number; timeoutMs?: number } = {},
): Promise<PwaReadinessReport> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const checkedAt = opts.now ?? Math.floor(Date.now() / 1000);
  const reasons = new Set<PwaReadinessReason>();

  let html: string;
  let finalUrl: URL;
  try {
    const res = await fetchWithTimeout(fetchImpl, upstreamUrl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    html = await res.text();
    finalUrl = new URL(res.url || upstreamUrl);
    reasons.add('html-fetched');
  } catch {
    return { status: 'estimated', reasons: ['fetch-failed'], checkedAt };
  }

  const manifestHref = findManifestHref(html);
  const themeColor = /<meta\s+[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=/i.test(html);
  reasons.add(themeColor ? 'theme-color-set' : 'theme-color-missing');

  // The wrapper covers every gap the upstream leaves: the rewriter injects
  // the synthesized /__shippie/manifest link when no manifest is present,
  // icons.ts serves real install icons, and the injected SDK registers
  // /__shippie/sw.js. None of these are failures — they're provided.
  if (!manifestHref) {
    reasons.add('manifest-provided-by-shippie');
    reasons.add('icons-provided-by-shippie');
    reasons.add('service-worker-provided-by-shippie');
    return { status: 'detected', reasons: [...reasons], checkedAt };
  }

  reasons.add('manifest-found');
  try {
    const manifestUrl = new URL(manifestHref, finalUrl).toString();
    const manifestRes = await fetchWithTimeout(fetchImpl, manifestUrl, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!manifestRes.ok) throw new Error(`manifest failed: ${manifestRes.status}`);
    const manifest = (await manifestRes.json()) as Record<string, unknown>;
    reasons.add(typeof manifest.name === 'string' || typeof manifest.short_name === 'string'
      ? 'manifest-name-found'
      : 'manifest-name-missing');
    reasons.add(Array.isArray(manifest.icons) && manifest.icons.length > 0
      ? 'manifest-icons-found'
      : 'manifest-icons-missing');
    reasons.add(manifest.display === 'standalone' || manifest.display === 'fullscreen' || manifest.display === 'minimal-ui'
      ? 'manifest-display-found'
      : 'manifest-display-missing');
  } catch {
    // Upstream declares its own manifest but the probe can't read it.
    // The rewriter keeps the upstream link (it only injects when none is
    // declared), so this stays a genuine gap on the upstream's side.
    reasons.add('manifest-invalid');
    reasons.add('manifest-name-missing');
    reasons.add('manifest-icons-missing');
    reasons.add('manifest-display-missing');
  }

  reasons.add('service-worker-provided-by-shippie');
  const hasStaticManifestBasics =
    reasons.has('manifest-found') &&
    reasons.has('manifest-name-found') &&
    reasons.has('manifest-icons-found') &&
    reasons.has('manifest-display-found');
  return { status: hasStaticManifestBasics ? 'detected' : 'estimated', reasons: [...reasons], checkedAt };
}

export function detectStaticBundlePwaReadiness(input: {
  files: ReadonlyMap<string, Uint8Array>;
  manifest: ShippieJsonLite;
  now?: number;
}): PwaReadinessReport {
  const reasons = new Set<PwaReadinessReason>();
  const checkedAt = input.now ?? Math.floor(Date.now() / 1000);

  // Static bundles are served by the wrapper, which synthesizes the
  // webmanifest (manifest.ts), install icons (icons.ts) and the service
  // worker (sw.ts) for every app. Anything the bundle doesn't ship is
  // provided by Shippie at serve time — never a failure.
  reasons.add('manifest-provided-by-shippie');
  reasons.add(input.manifest.name ? 'manifest-name-found' : 'manifest-name-missing');
  reasons.add(input.manifest.icon || bundleHasIcon(input.files) ? 'manifest-icons-found' : 'icons-provided-by-shippie');
  reasons.add('manifest-display-found');
  reasons.add(input.manifest.theme_color ? 'theme-color-set' : 'theme-color-missing');
  reasons.add('service-worker-provided-by-shippie');

  return { status: 'detected', reasons: [...reasons], checkedAt };
}

function bundleHasIcon(files: ReadonlyMap<string, Uint8Array>): boolean {
  for (const path of files.keys()) {
    if (/(\bicon\b|apple-touch-icon|favicon).*\.(png|svg|webp|jpg|jpeg)$/i.test(path)) return true;
  }
  return false;
}

function findManifestHref(html: string): string | null {
  const linkRe = /<link\b[^>]*rel\s*=\s*["'][^"']*\bmanifest\b[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0] ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) return href;
  }
  return null;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
