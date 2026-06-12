import { describe, expect, test } from 'vitest';
import { GET } from '../../routes/__shippie-pwa/sw.js/+server';

async function swBody(): Promise<string> {
  const response = await GET({
    platform: { env: { CF_VERSION_METADATA: { id: 'test-build' } } },
  } as never);
  return response.text();
}

describe('/__shippie-pwa/sw.js', () => {
  test('generates parseable service-worker JavaScript', async () => {
    const response = await GET({
      platform: { env: { CF_VERSION_METADATA: { id: 'test-build' } } },
    } as never);
    const body = await response.text();

    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(body).toContain('shippie-marketplace SW');
    expect(() => new Function(body)).not.toThrow();
  });

  test('does not let a sealed offline capsule pin online runtime entry documents', async () => {
    const response = await GET({
      platform: { env: { CF_VERSION_METADATA: { id: 'test-build' } } },
    } as never);
    const body = await response.text();

    expect(body).toContain('Saved/offline should never pin an online');
    expect(body).not.toContain('const capsuleHit = await cachedCapsuleResponse(req, slug);');
    const runtimeBranch = body.slice(body.indexOf('// /__shippie-run/<slug>/*'));
    expect(runtimeBranch.indexOf('if (isEntryDocument && !browserReportsOffline())')).toBeLessThan(
      runtimeBranch.indexOf('if (browserReportsOffline())'),
    );
    expect(runtimeBranch.indexOf('if (browserReportsOffline())')).toBeLessThan(
      runtimeBranch.indexOf('const cached = await cache.match(req);'),
    );
  });

  test('turns interrupted offline saves into errors instead of permanent downloading state', async () => {
    const response = await GET({
      platform: { env: { CF_VERSION_METADATA: { id: 'test-build' } } },
    } as never);
    const body = await response.text();

    expect(body).toContain('DOWNLOAD_POINTER_STALE_MS');
    expect(body).toContain('function staleDownloadPointer(pointer)');
    expect(body).toContain("state: 'error'");
    expect(body).toContain("error: pointer.error || 'download_interrupted'");
  });

  test('gives network-first shell documents a slow-network budget instead of hanging', async () => {
    const body = await swBody();

    // Short budget when a saved copy exists, longer when there is nothing
    // to fall back to.
    expect(body).toContain('const DOC_TIMEOUT_WITH_FALLBACK_MS = 3500;');
    expect(body).toContain('const DOC_TIMEOUT_WITHOUT_FALLBACK_MS = 12000;');
    expect(body).toContain('async function fetchWithTimeout(req, timeoutMs)');

    // The document branch checks the cache first to pick the budget, then
    // races the network against it.
    const docBranch = body.slice(body.indexOf("const isDoc = req.mode === 'navigate'"));
    expect(docBranch).toContain('const cachedDoc = await cachedShellDocument(cache, req);');
    expect(docBranch).toContain(
      'const budgetMs = cachedDoc ? DOC_TIMEOUT_WITH_FALLBACK_MS : DOC_TIMEOUT_WITHOUT_FALLBACK_MS;',
    );
    expect(docBranch.indexOf('const cachedDoc = await cachedShellDocument(cache, req);')).toBeLessThan(
      docBranch.indexOf('fetchWithTimeout(req, budgetMs)'),
    );
  });

  test('announces stale-due-to-timeout documents to all windows', async () => {
    const body = await swBody();

    expect(body).toContain('async function notifySlowNetworkFallback(resource)');
    expect(body).toContain("client.postMessage({ type: 'SLOW_NETWORK_FALLBACK', resource })");
    // Only a timeout (not a plain network failure) flags the slow network,
    // and only when a saved copy is actually being served.
    const docBranch = body.slice(body.indexOf("const isDoc = req.mode === 'navigate'"));
    expect(docBranch).toContain(
      "if (err && err.name === 'ShippieSlowNetworkTimeout') notifySlowNetworkFallback(url.pathname);",
    );
  });

  test('offline home prefers dock-shell links only when the shell document is cached', async () => {
    const body = await swBody();

    // Link builder + cache probe exist and feed each saved app row.
    expect(body).toContain('function dockFocusedHref(slug)');
    expect(body).toContain('async function dockShellAvailable(shellCache, slug)');
    expect(body).toContain(
      'shellHref: (await dockShellAvailable(shellCache, pointer.slug)) ? dockFocusedHref(pointer.slug) : null,',
    );
    // Direct capsule launch stays as the fallback when /dock was never cached.
    expect(body).toContain("const href = app.shellHref || ('/run/' + encodeURIComponent(app.slug) + '/');");
    // The offline home page builds against the marketplace shell cache.
    expect(body).toContain('const apps = await offlineHomeApps(shellCache);');
  });

  test('serves the cached dock shell for offline /dock?app= navigations instead of looping to offline home', async () => {
    const body = await swBody();

    const docBranch = body.slice(body.indexOf("const isDoc = req.mode === 'navigate'"));
    const offlineGuard = docBranch.indexOf('if (browserReportsOffline()) {');
    const dockCheck = docBranch.indexOf("if (url.pathname === '/dock' && url.searchParams.get('app'))");
    const offlineHome = docBranch.indexOf('return offlineResponse();');
    expect(offlineGuard).toBeGreaterThan(-1);
    expect(dockCheck).toBeGreaterThan(offlineGuard);
    expect(offlineHome).toBeGreaterThan(dockCheck);
  });
});
