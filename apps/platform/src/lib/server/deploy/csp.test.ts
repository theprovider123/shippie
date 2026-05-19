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

  test('allows detected font/style hosts and keeps images constrained', () => {
    const csp = buildCsp(
      {
        ...manifest,
        allowed_resource_domains: ['images.openfoodfacts.org'],
      },
      {
        policy: {
          styleSrc: ['https://fonts.googleapis.com'],
          fontSrc: ['https://fonts.gstatic.com'],
          imgSrc: ['https://tile.openstreetmap.org'],
        },
      },
    );

    expect(csp.header).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp.header).toContain("font-src 'self' data: https://fonts.gstatic.com");
    expect(csp.header).toContain(
      "img-src 'self' data: blob: https://images.openfoodfacts.org https://tile.openstreetmap.org",
    );
    expect(csp.header).not.toMatch(/img-src[^;]*\shttps:(?:\s|;|$)/);
  });
});
