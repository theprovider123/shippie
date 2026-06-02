import { describe, expect, test } from 'vitest';
import { GET } from '../../routes/__shippie-pwa/sw.js/+server';

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
});
