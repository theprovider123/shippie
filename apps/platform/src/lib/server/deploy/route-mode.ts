/**
 * Deploy route-mode detection.
 *
 * Shippie's wrapper can serve either:
 *   - SPA fallback: unknown navigations return root index.html
 *   - MPA routing: exact files and /route/index.html resolve, unknown paths 404
 *
 * The classifier is intentionally conservative and pure. It does not try to
 * prove framework intent from package.json; it reads the final normalized
 * deploy files that will actually be uploaded.
 */

export type RouteMode = 'spa' | 'mpa';

export interface RouteModeDecision {
  mode: RouteMode;
  confidence: number;
  reasons: string[];
  htmlFiles: string[];
}

const decoder = new TextDecoder('utf-8', { fatal: false });
const JS_EXT_RE = /\.(?:m?js|cjs)$/i;

const SPA_MARKERS = [
  'createBrowserRouter',
  'BrowserRouter',
  'react-router',
  'vue-router',
  'createWebHistory',
  'svelte-spa-router',
  '@reach/router',
  'history.pushState',
  'vite/modulepreload-polyfill',
];

export function detectRouteMode(files: ReadonlyMap<string, Uint8Array>): RouteModeDecision {
  const htmlFiles = [...files.keys()]
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort();

  if (!files.has('index.html')) {
    return {
      mode: 'mpa',
      confidence: 0.4,
      reasons: ['No root index.html; wrapper should not invent SPA fallback.'],
      htmlFiles,
    };
  }

  const nestedHtmlFiles = htmlFiles.filter((path) => path !== 'index.html');
  const has404 = files.has('404.html') || files.has('404/index.html');
  const spaSignals = findSpaSignals(files);

  if (nestedHtmlFiles.length === 0) {
    return {
      mode: 'spa',
      confidence: spaSignals.length > 0 ? 0.9 : 0.75,
      reasons:
        spaSignals.length > 0
          ? [`Single HTML entry plus SPA signal: ${spaSignals[0]}.`]
          : ['Single root index.html with no nested HTML pages.'],
      htmlFiles,
    };
  }

  if (spaSignals.length > 0 && nestedHtmlFiles.length <= 2 && !has404) {
    return {
      mode: 'spa',
      confidence: 0.68,
      reasons: [
        `SPA signal found: ${spaSignals[0]}.`,
        `${nestedHtmlFiles.length} nested HTML file(s), but no explicit 404.html.`,
      ],
      htmlFiles,
    };
  }

  return {
    mode: 'mpa',
    confidence: has404 ? 0.9 : 0.8,
    reasons: [
      `${nestedHtmlFiles.length} nested HTML file(s) found.`,
      has404 ? 'Explicit 404 page present.' : 'No strong SPA router signal found.',
    ],
    htmlFiles,
  };
}

function findSpaSignals(files: ReadonlyMap<string, Uint8Array>): string[] {
  const signals = new Set<string>();

  for (const [path, bytes] of files) {
    if (!JS_EXT_RE.test(path) && path !== 'index.html') continue;
    const text = decoder.decode(bytes);
    for (const marker of SPA_MARKERS) {
      if (text.includes(marker)) signals.add(marker);
    }
  }

  return [...signals];
}
