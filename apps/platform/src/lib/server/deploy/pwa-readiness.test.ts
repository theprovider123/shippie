import { describe, expect, it, vi } from 'vitest';
import { detectStaticBundlePwaReadiness, probeWrappedUrlPwaReadiness } from './pwa-readiness';

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
    expect(report.reasons).toContain('service-worker-runtime-required');
  });

  it('keeps plain HTML as estimated Web App material', async () => {
    const fetchImpl = fetchMap({
      'https://docs.example/': new Response('<title>Docs</title>', { status: 200 }),
    });
    const report = await probeWrappedUrlPwaReadiness('https://docs.example/', { fetchImpl, now: 10 });
    expect(report.status).toBe('estimated');
    expect(report.reasons).toContain('manifest-missing');
    expect(report.reasons).toContain('theme-color-missing');
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
    expect(report.reasons).toContain('service-worker-runtime-required');
  });
});
