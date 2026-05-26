import { describe, expect, test } from 'bun:test';
import { PARADE_OFFLINE_ASSETS } from './offline-save';

describe('offline-save', () => {
  test('offline bundle includes every route pack and registry', () => {
    expect(PARADE_OFFLINE_ASSETS).toContain('route-pack.json');
    expect(PARADE_OFFLINE_ASSETS).toContain('packs/index.json');
    expect(PARADE_OFFLINE_ASSETS).toContain('packs/watford-vicarage.json');
  });

  test('offline bundle includes app install metadata and design fonts', () => {
    expect(PARADE_OFFLINE_ASSETS).toContain('manifest.webmanifest');
    expect(PARADE_OFFLINE_ASSETS).toContain('icon.svg');
    expect(PARADE_OFFLINE_ASSETS.filter((asset) => asset.startsWith('fonts/')).length).toBe(7);
  });
});
