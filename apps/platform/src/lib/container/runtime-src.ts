interface RuntimeApp {
  devUrl?: string | null;
  standaloneUrl?: string | null;
}

/**
 * Pick the iframe URL for an app based on environment:
 * - Localhost dev prefers the app's dev server URL.
 * - Production prefers same-origin /run/<slug>/ URLs when available.
 * - Absolute standalone URLs (custom domains / app subdomains) are still
 *   valid container runtimes and are paired with precise origin filtering.
 */
export function resolveRuntimeSrc(app: RuntimeApp, currentHostname: string): string | null {
  const onLocalhost =
    currentHostname === 'localhost' ||
    currentHostname === '127.0.0.1' ||
    currentHostname === '[::1]';
  if (onLocalhost && app.devUrl) return app.devUrl;
  if (!onLocalhost && app.standaloneUrl?.startsWith('/run/')) {
    return iframeRuntimeUrl(app.standaloneUrl);
  }
  if (app.standaloneUrl && /^https?:\/\//i.test(app.standaloneUrl)) return app.standaloneUrl;
  return null;
}

function iframeRuntimeUrl(path: string): string {
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = /^\/run\/[^/]+$/.test(rawPath) ? `${rawPath}/` : rawPath;
  const params = new URLSearchParams(rawQuery);
  params.set('shippie_embed', '1');
  const query = params.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}
