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
});
