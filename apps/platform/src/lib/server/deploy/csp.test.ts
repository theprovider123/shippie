import { describe, expect, test } from 'vitest';
import { buildCsp } from './csp';
import type { ShippieJsonLite } from './manifest';

const manifest = {
  name: 'Weather Tool',
  slug: 'weather-tool',
  type: 'app',
  category: 'tools',
  permissions: { external_network: true },
  allowed_connect_domains: ['api.weather.test'],
} as ShippieJsonLite;

describe('buildCsp', () => {
  test('uses declared and detected connect domains without broad https connect-src', () => {
    const csp = buildCsp(manifest, {
      connectDomains: ['https://world.openfoodfacts.org'],
    });

    expect(csp.header).toContain(
      "connect-src 'self' https://api.weather.test https://world.openfoodfacts.org",
    );
    expect(csp.header).not.toMatch(/connect-src[^;]*\shttps:(?:\s|;|$)/);
  });

  test('allows detected resource hosts and keeps images constrained', () => {
    const csp = buildCsp(
      {
        ...manifest,
        allowed_resource_domains: ['images.openfoodfacts.org'],
        },
      {
        policy: {
          styleSrc: ['https://static.example.com'],
          fontSrc: ['https://assets.example.com'],
          imgSrc: ['https://tile.openstreetmap.org'],
        },
      },
    );

    expect(csp.header).toContain("style-src 'self' 'unsafe-inline' https://static.example.com");
    expect(csp.header).toContain("font-src 'self' data: https://assets.example.com");
    expect(csp.header).toContain(
      "img-src 'self' data: blob: https://images.openfoodfacts.org https://tile.openstreetmap.org",
    );
    expect(csp.header).not.toMatch(/img-src[^;]*\shttps:(?:\s|;|$)/);
  });

  test('frame-ancestors allows the Dock platform origins, not none/wildcard', () => {
    const csp = buildCsp(manifest);
    expect(csp.header).toContain(
      "frame-ancestors 'self' https://shippie.app https://www.shippie.app https://next.shippie.app",
    );
    expect(csp.header).not.toContain("frame-ancestors 'none'");
    expect(csp.header).not.toContain('*.shippie.app');
  });
});
