import { describe, expect, test } from 'bun:test';
import {
  OFFLINE_CAPSULE_REPAIR_HEADER,
  OFFLINE_CAPSULE_SW_HELPERS,
  capsuleCacheName,
  extractSyntheticBootUrls,
  hashCapsuleManifest,
  isDocumentRequestMetadata,
  normalizeCapsuleManifest,
  repairResponseInit,
  sealCapsuleManifest,
} from './index';

describe('@shippie/offline-capsule manifest helpers', () => {
  test('normalizes legacy asset manifests and creates an atomic cache name', async () => {
    const manifest = await sealCapsuleManifest({
      slug: 'tap-counter',
      buildId: 'abc123',
      totalBytes: 12,
      assets: [
        '/__shippie-run/tap-counter/?shippie_embed=1',
        { url: '/__shippie-run/tap-counter/assets/app.js', size: 12, sha256: 'a'.repeat(64) },
      ],
    });

    expect(manifest.protocolVersion).toBe(1);
    expect(manifest.entryUrl).toBe('/__shippie-run/tap-counter/?shippie_embed=1');
    expect(manifest.version).toBe('abc123');
    expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(capsuleCacheName(manifest.slug, manifest.manifestHash)).toBe(
      `capsule:tap-counter:${manifest.manifestHash}`,
    );
  });

  test('hashing ignores an existing manifestHash field', async () => {
    const manifest = normalizeCapsuleManifest({
      slug: 'notes',
      assets: ['/__shippie-run/notes/?shippie_embed=1'],
      manifestHash: 'f'.repeat(64),
    });
    const withHash = { ...manifest, manifestHash: 'f'.repeat(64) };
    const withoutHash = { ...manifest };
    delete withoutHash.manifestHash;

    await expect(hashCapsuleManifest(withHash)).resolves.toBe(await hashCapsuleManifest(withoutHash));
  });
});

describe('@shippie/offline-capsule request classification', () => {
  test('treats JS module requests as subresources even when Accept is broad', () => {
    expect(
      isDocumentRequestMetadata({
        destination: 'script',
        headers: { accept: 'text/html,application/xhtml+xml,*/*' },
      }),
    ).toBe(false);
  });

  test('detects document navigations by Sec-Fetch-Dest instead of file extension', () => {
    expect(
      isDocumentRequestMetadata({
        destination: '',
        headers: { 'sec-fetch-dest': 'document', accept: '*/*' },
      }),
    ).toBe(true);
  });

  test('builds typed repair responses with the slug header', () => {
    const init = repairResponseInit('recipe');
    expect(init.status).toBe(503);
    expect((init.headers as Record<string, string>)[OFFLINE_CAPSULE_REPAIR_HEADER]).toBe('recipe');
  });
});

describe('@shippie/offline-capsule synthetic boot extraction', () => {
  test('resolves same-origin scripts, links, images, srcsets, and CSS urls', () => {
    const urls = extractSyntheticBootUrls(
      `
        <link rel="stylesheet" href="./assets/app.css">
        <script type="module" src="/__shippie-run/demo/assets/app.js"></script>
        <img src="icons/icon.png" srcset="icons/icon@2x.png 2x, icons/icon@3x.png 3x">
        <style>.hero{background:url('/__shippie-run/demo/assets/hero.webp')}</style>
        <img src="data:image/png;base64,abc">
      `,
      '/__shippie-run/demo/?shippie_embed=1',
    );

    expect(urls).toEqual([
      '/__shippie-run/demo/assets/app.css',
      '/__shippie-run/demo/assets/app.js',
      '/__shippie-run/demo/assets/hero.webp',
      '/__shippie-run/demo/icons/icon.png',
      '/__shippie-run/demo/icons/icon@2x.png',
      '/__shippie-run/demo/icons/icon@3x.png',
    ]);
  });

  test('ships shared helper source for generated workers', () => {
    expect(OFFLINE_CAPSULE_SW_HELPERS).toContain('ShippieOfflineCapsule');
    expect(OFFLINE_CAPSULE_SW_HELPERS).toContain('X-Shippie-Repair');
    expect(OFFLINE_CAPSULE_SW_HELPERS).toContain('capsule:');
  });
});
