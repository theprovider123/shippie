import { describe, expect, it, vi } from 'vitest';
import { detectStaticBundlePwaReadiness, probeWrappedUrlPwaReadiness } from './pwa-readiness';
import { pwaChecklist, summarizePwaReadiness } from '$lib/types/pwa-readiness';

const enc = (s: string) => new TextEncoder().encode(s);

function fetchMap(map: Record<string, Response>): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL) => {
    const key = String(url);
    const response = map[key];
    if (!response) return new Response('missing', { status: 404 });
    return response;
  }) as unknown as typeof fetch;
}

describe('probeWrappedUrlPwaReadiness', () => {
  it('detects manifest basics from a wrapped URL', async () => {
    const fetchImpl = fetchMap({
      'https://example.com/': new Response(
        '<meta name="theme-color" content="#111"><link rel="manifest" href="/manifest.webmanifest">',
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
      'https://example.com/manifest.webmanifest': Response.json({
        name: 'Example',
        display: 'standalone',
        icons: [{ src: '/icon.png', sizes: '192x192' }],
      }),
    });
    const report = await probeWrappedUrlPwaReadiness('https://example.com/', { fetchImpl, now: 10 });
    expect(report.status).toBe('detected');
    expect(report.reasons).toContain('manifest-found');
    expect(report.reasons).toContain('manifest-icons-found');
    // The wrapper's injected SDK registers /__shippie/sw.js for every
    // wrapped app — the service worker is provided, not a pending failure.
    expect(report.reasons).toContain('service-worker-provided-by-shippie');
    expect(report.reasons).not.toContain('service-worker-runtime-required');
  });

  it('treats manifest-less upstreams as covered by the wrapper, not failing', async () => {
    const fetchImpl = fetchMap({
      'https://docs.example/': new Response('<title>Docs</title>', { status: 200 }),
    });
    const report = await probeWrappedUrlPwaReadiness('https://docs.example/', { fetchImpl, now: 10 });
    // The rewriter injects /__shippie/manifest when the upstream declares
    // none, so the wrapped app is installable: detected, with the gap
    // attributed to Shippie's coverage rather than read as failures.
    expect(report.status).toBe('detected');
    expect(report.reasons).toContain('manifest-provided-by-shippie');
    expect(report.reasons).toContain('icons-provided-by-shippie');
    expect(report.reasons).toContain('service-worker-provided-by-shippie');
    expect(report.reasons).not.toContain('manifest-missing');
    expect(report.reasons).toContain('theme-color-missing');
  });

  it('keeps a broken upstream-declared manifest as a genuine gap', async () => {
    const fetchImpl = fetchMap({
      'https://broken.example/': new Response(
        '<link rel="manifest" href="/manifest.webmanifest">',
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
      'https://broken.example/manifest.webmanifest': new Response('not-json', { status: 200 }),
    });
    const report = await probeWrappedUrlPwaReadiness('https://broken.example/', { fetchImpl, now: 10 });
    // The rewriter only injects when no manifest link exists, so a broken
    // upstream manifest is the upstream's problem — honest 'estimated'.
    expect(report.status).toBe('estimated');
    expect(report.reasons).toContain('manifest-invalid');
    expect(report.reasons).toContain('manifest-icons-missing');
    expect(report.reasons).not.toContain('manifest-provided-by-shippie');
  });

  it('records failed fetches without blocking wrap deploys', async () => {
    const report = await probeWrappedUrlPwaReadiness('https://down.example/', {
      fetchImpl: vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      now: 10,
    });
    expect(report).toEqual({ status: 'estimated', reasons: ['fetch-failed'], checkedAt: 10 });
  });
});

describe('detectStaticBundlePwaReadiness', () => {
  it('marks Shippie-built static bundles as detected, not confirmed', () => {
    const report = detectStaticBundlePwaReadiness({
      files: new Map([['public/icon.svg', enc('<svg/>')]]),
      manifest: { slug: 'recipe', type: 'app', name: 'Recipe', category: 'tools', theme_color: '#111' },
      now: 10,
    });
    expect(report.status).toBe('detected');
    expect(report.reasons).toContain('manifest-provided-by-shippie');
    expect(report.reasons).toContain('service-worker-provided-by-shippie');
    expect(report.reasons).not.toContain('service-worker-runtime-required');
  });

  it('attributes missing icons to Shippie default icons, not a failure', () => {
    const report = detectStaticBundlePwaReadiness({
      files: new Map([['index.html', enc('<html></html>')]]),
      manifest: { slug: 'notes', type: 'app', name: 'Notes', category: 'tools' },
      now: 10,
    });
    expect(report.status).toBe('detected');
    expect(report.reasons).toContain('icons-provided-by-shippie');
    expect(report.reasons).not.toContain('manifest-icons-missing');
  });
});

describe('summarizePwaReadiness', () => {
  it('splits wrapper-covered pieces away from genuine gaps', () => {
    const summary = summarizePwaReadiness([
      'manifest-provided-by-shippie',
      'manifest-name-found',
      'icons-provided-by-shippie',
      'manifest-display-found',
      'theme-color-missing',
      'service-worker-provided-by-shippie',
    ]);
    expect(summary.passes).toEqual(['App name', 'Standalone display']);
    expect(summary.gaps).toEqual(['Theme color']);
    expect(summary.providedByShippie).toEqual([
      'Web app manifest',
      'Install icons',
      'Service worker',
    ]);
  });

  it('keeps real upstream gaps in the gap list', () => {
    const summary = summarizePwaReadiness([
      'manifest-found',
      'manifest-name-missing',
      'manifest-icons-missing',
      'manifest-display-missing',
      'theme-color-set',
      'service-worker-provided-by-shippie',
    ]);
    expect(summary.passes).toEqual(['Web app manifest', 'Theme color']);
    expect(summary.gaps).toEqual(['App name', 'Install icons', 'Standalone display']);
    expect(summary.providedByShippie).toEqual(['Service worker']);
  });

  it('handles null reasons', () => {
    expect(summarizePwaReadiness(null)).toEqual({ passes: [], gaps: [], providedByShippie: [] });
  });
});

describe('pwaChecklist with provided-by-shippie reasons', () => {
  it('renders wrapper-covered items as passing, never failing', () => {
    const items = pwaChecklist([
      'manifest-provided-by-shippie',
      'icons-provided-by-shippie',
      'service-worker-provided-by-shippie',
      'theme-color-set',
    ]);
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get('manifest')?.ok).toBe(true);
    expect(byId.get('icons')?.ok).toBe(true);
    expect(byId.get('display')?.ok).toBe(true);
    expect(byId.get('serviceWorker')?.ok).toBe(true);
    expect(byId.get('icons')?.detail).toContain('Shippie provides');
  });
});
