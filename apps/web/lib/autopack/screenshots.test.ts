import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEWPORTS } from './screenshots';

test('VIEWPORTS has 3 entries with correct dimensions', () => {
  assert.equal(VIEWPORTS.length, 3);
  assert.equal(VIEWPORTS[0].name, 'mobile-portrait');
  assert.equal(VIEWPORTS[0].width, 390);
  assert.equal(VIEWPORTS[0].height, 844);
  assert.equal(VIEWPORTS[1].name, 'mobile-landscape');
  assert.equal(VIEWPORTS[2].name, 'desktop');
  assert.equal(VIEWPORTS[2].width, 1280);
});

test('captureScreenshots returns early when ENABLE_SCREENSHOTS is not set', async () => {
  delete process.env.ENABLE_SCREENSHOTS;
  const { captureScreenshots } = await import('./screenshots');
  const r = await captureScreenshots({
    slug: 'test',
    version: 1,
    appId: 'abc',
    baseUrl: 'http://test.localhost:4200/',
    r2: { put: async () => {}, get: async () => null } as any,
  });
  assert.equal(r.success, true);
  assert.equal(r.r2Keys.length, 0);
  assert.equal(r.errors.length, 0);
});
