/**
 * Lightweight installability + health check — Phase 2.5.
 *
 * Runs in the synchronous deploy critical path so the budget must stay
 * tight. Per the master plan: full Lighthouse moves to async / sampled /
 * preview-only runs and is NOT what this module does.
 *
 * What we verify (all by inspecting the extracted file map — no network):
 *   - index.html exists and parses as HTML
 *   - manifest.json is valid JSON if present (the wrapper synthesizes a
 *     manifest if absent, but if a maker shipped a broken one we should
 *     warn before it confuses the install funnel)
 *   - Service worker file exists if registered from index.html
 *   - All <script src=> and <link href=> references inside index.html
 *     point at files that actually shipped
 *   - Basic installability sanity: theme-color, viewport, manifest link
 *
 * Returns a structured report. Pure — no I/O.
 */

export type HealthCheckSeverity = 'ok' | 'warn' | 'fail';

export interface HealthCheckItem {
  id: HealthCheckId;
  severity: HealthCheckSeverity;
  title: string;
  detail?: string;
}

export type HealthCheckId =
  | 'index_html'
  | 'manifest_present'
  | 'manifest_valid'
  | 'sw_registration'
  | 'asset_resolution'
  | 'installable_meta';

export interface HealthCheckReport {
  /** True iff every check is `ok` or `warn`. A `fail` result blocks the
   *  deploy from being marked healthy (Phase 4 will gate the public
   *  surface on this). */
  passed: boolean;
  items: HealthCheckItem[];
}

const decoder = new TextDecoder('utf-8', { fatal: false });

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const LINK_HREF_RE = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
const SW_REGISTER_RE = /navigator\.serviceWorker\.register\s*\(\s*["']([^"']+)["']/i;

function isExternal(ref: string): boolean {
  return /^(?:https?:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('blob:');
}

function normalize(ref: string, baseDir: string): string | null {
  if (isExternal(ref)) return null; // not our problem
  let path = ref.split('?')[0]?.split('#')[0] ?? '';
  if (path.startsWith('/')) {
    path = path.slice(1);
  } else if (baseDir) {
    path = baseDir + path;
  }
  return path || null;
}

export function runHealthCheck(files: ReadonlyMap<string, Uint8Array>): HealthCheckReport {
  const items: HealthCheckItem[] = [];

  // 1. index.html
  const indexBytes = files.get('index.html');
  if (!indexBytes) {
    items.push({
      id: 'index_html',
      severity: 'fail',
      title: 'index.html missing',
      detail:
        'No index.html in the bundle root. The wrapper falls back to the offline page, but the maker app cannot launch.',
    });
    return { passed: false, items };
  }
  items.push({ id: 'index_html', severity: 'ok', title: 'index.html present' });
  const indexHtml = decoder.decode(indexBytes);

  // 2. manifest — present?
  const manifestPath = findManifestPath(files);
  if (manifestPath) {
    items.push({
      id: 'manifest_present',
      severity: 'ok',
      title: `Manifest present (${manifestPath})`,
    });
    // 2b. Valid JSON?
    try {
      const m = JSON.parse(decoder.decode(files.get(manifestPath)!));
      const hasName = typeof m.name === 'string' || typeof m.short_name === 'string';
      const hasIcons = Array.isArray(m.icons) && m.icons.length > 0;
      const startUrl = typeof m.start_url === 'string';
      const display = typeof m.display === 'string';
      const missing: string[] = [];
      if (!hasName) missing.push('name');
      if (!hasIcons) missing.push('icons');
      if (!startUrl) missing.push('start_url');
      if (!display) missing.push('display');
      items.push({
        id: 'manifest_valid',
        severity: missing.length > 0 ? 'warn' : 'ok',
        title:
          missing.length > 0
            ? `Manifest missing fields: ${missing.join(', ')}`
            : 'Manifest looks complete',
        detail:
          missing.length > 0
            ? 'The wrapper auto-fills these — the warning is for makers who want full control of their PWA listing.'
            : undefined,
      });
    } catch (err) {
      items.push({
        id: 'manifest_valid',
        severity: 'fail',
        title: 'Manifest is not valid JSON',
        detail: (err as Error).message,
      });
    }
  } else {
    items.push({
      id: 'manifest_present',
      severity: 'ok',
      title: 'No manifest in bundle (Shippie generates one)',
      detail:
        'Shippie auto-injects a manifest at /__shippie/manifest based on shippie.json. Bundling your own is optional.',
    });
  }

  // 3. Service worker — if the maker registered one in index.html, the
  //    file should exist in the bundle. Shippie's wrapper SW is separate
  //    and not subject to this check.
  const swMatch = indexHtml.match(SW_REGISTER_RE);
  if (swMatch) {
    const swRef = swMatch[1] ?? '';
    if (swRef.startsWith('/__shippie/')) {
      items.push({
        id: 'sw_registration',
        severity: 'ok',
        title: 'Uses Shippie wrapper SW',
      });
    } else {
      const swPath = normalize(swRef, '');
      if (swPath && files.has(swPath)) {
        items.push({
          id: 'sw_registration',
          severity: 'ok',
          title: `Service worker present (${swPath})`,
        });
      } else {
        items.push({
          id: 'sw_registration',
          severity: 'warn',
          title: `Service worker file missing: ${swRef}`,
          detail:
            'The HTML registers a service worker but the file was not in the upload. Browsers will silently fail SW registration. Either include the file or rely on Shippie\'s wrapper SW.',
        });
      }
    }
  } else {
    items.push({
      id: 'sw_registration',
      severity: 'ok',
      title: 'Wrapper SW provided by Shippie',
    });
  }

  // 4. Asset resolution — referenced JS/CSS in index.html should exist.
  const missingAssets: string[] = [];
  let scriptCount = 0;
  let linkCount = 0;
  SCRIPT_SRC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_SRC_RE.exec(indexHtml))) {
    const ref = m[1] ?? '';
    if (isExternal(ref)) continue;
    scriptCount++;
    const path = normalize(ref, '');
    if (!path) continue;
    if (!files.has(path)) missingAssets.push(ref);
  }
  LINK_HREF_RE.lastIndex = 0;
  while ((m = LINK_HREF_RE.exec(indexHtml))) {
    const ref = m[1] ?? '';
    if (isExternal(ref)) continue;
    linkCount++;
    const path = normalize(ref, '');
    if (!path) continue;
    // Skip /__shippie/ paths — those are wrapper-served, not in bundle.
    if (path.startsWith('__shippie/')) continue;
    if (!files.has(path)) missingAssets.push(ref);
  }
  if (missingAssets.length > 0) {
    items.push({
      id: 'asset_resolution',
      severity: 'warn',
      title: `${missingAssets.length} broken asset reference${missingAssets.length === 1 ? '' : 's'}`,
      detail: missingAssets.slice(0, 5).join(', '),
    });
  } else {
    items.push({
      id: 'asset_resolution',
      severity: 'ok',
      title: `${scriptCount} script${scriptCount === 1 ? '' : 's'} + ${linkCount} link${linkCount === 1 ? '' : 's'} resolve`,
    });
  }

  // 5. Installable meta — viewport + manifest link + theme-color.
  //    These are also injected by injectEssentials() if missing, so a
  //    maker app should always pass after the deploy pipeline runs. The
  //    check still runs here so the report is honest even if the
  //    injection ever silently fails.
  const hasViewport = /<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(indexHtml);
  const hasManifestLink =
    /<link\s+[^>]*rel\s*=\s*["']manifest["']/i.test(indexHtml) || manifestPath !== null;
  const hasThemeColor = /<meta\s+[^>]*name\s*=\s*["']theme-color["']/i.test(indexHtml);
  const missing: string[] = [];
  if (!hasViewport) missing.push('viewport');
  if (!hasManifestLink) missing.push('manifest link');
  if (!hasThemeColor) missing.push('theme-color');
  items.push({
    id: 'installable_meta',
    severity: missing.length > 0 ? 'warn' : 'ok',
    title:
      missing.length > 0
        ? `Installability hints missing: ${missing.join(', ')}`
        : 'Installability hints present',
  });

  const passed = !items.some((i) => i.severity === 'fail');
  return { passed, items };
}

function findManifestPath(files: ReadonlyMap<string, Uint8Array>): string | null {
  // Common locations.
  const candidates = ['manifest.json', 'manifest.webmanifest', 'site.webmanifest'];
  for (const c of candidates) {
    if (files.has(c)) return c;
  }
  return null;
}
