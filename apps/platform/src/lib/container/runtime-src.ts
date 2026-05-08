interface RuntimeApp {
  devUrl?: string | null;
  standaloneUrl?: string | null;
}

interface RuntimeSrcOptions {
  preferDevUrl?: boolean;
}

/**
 * Pick the iframe URL for an app based on environment:
 * - Localhost uses the bundled /run/<slug>/ app by default so the
 *   launcher works without also running every showcase dev server.
 * - Localhost can opt into the app dev server with preferDevUrl.
 * - Production prefers same-origin /run/<slug>/ URLs when available.
 * - Absolute standalone URLs (custom domains / app subdomains) are still
 *   valid container runtimes and are paired with precise origin filtering.
 */
export function resolveRuntimeSrc(
  app: RuntimeApp,
  currentHostname: string,
  options: RuntimeSrcOptions = {},
): string | null {
  const onLocalhost =
    currentHostname === 'localhost' ||
    currentHostname === '127.0.0.1' ||
    currentHostname === '[::1]';
  if (onLocalhost && options.preferDevUrl && app.devUrl) return app.devUrl;
  if (app.standaloneUrl?.startsWith('/run/')) {
    return iframeRuntimeUrl(app.standaloneUrl);
  }
  if (app.standaloneUrl && /^https?:\/\//i.test(app.standaloneUrl)) return app.standaloneUrl;
  return null;
}

function iframeRuntimeUrl(path: string): string {
  const [rawPath, rawQuery = ''] = path.split('?', 2);
  const normalizedPath = /^\/run\/[^/]+\/?$/.test(rawPath)
    ? `${rawPath.replace(/\/$/, '')}/index.html`
    : rawPath;
  const params = new URLSearchParams(rawQuery);
  params.set('shippie_embed', '1');
  const query = params.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}
