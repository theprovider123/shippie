import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ShippieJson } from '@shippie/shared';
import { injectPwaTags } from './inject-html.ts';

const baseManifest: ShippieJson = {
  version: 1,
  name: 'Recipes',
  slug: 'recipes',
  type: 'app',
  category: 'food_and_drink',
  theme_color: '#E8603C',
};

const SIMPLE_HTML = `<!doctype html>
<html>
<head>
<title>Recipes</title>
</head>
<body>
<h1>Hello</h1>
</body>
</html>`;

test('injects manifest, meta, SDK script, SW registration on a bare HTML doc', () => {
  const { html, modified } = injectPwaTags(SIMPLE_HTML, {
    manifest: baseManifest,
    version: 1,
  });

  assert.equal(modified, true);
  assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/__shippie\/manifest"/);
  assert.match(html, /<meta[^>]+name="theme-color"[^>]+content="#E8603C"/);
  assert.match(html, /<meta[^>]+name="apple-mobile-web-app-capable"/);
  assert.match(html, /<link[^>]+rel="apple-touch-icon"[^>]+href="\/__shippie\/icons\/180\.png"/);
  assert.match(html, /<script[^>]+src="\/__shippie\/sdk\.js"/);
  assert.match(html, /navigator\.serviceWorker\.register\('\/__shippie\/sw\.js'/);
  assert.match(html, /shippie-sw-registration/);
});

test('idempotent: running twice yields the same output', () => {
  const once = injectPwaTags(SIMPLE_HTML, { manifest: baseManifest, version: 1 });
  const twice = injectPwaTags(once.html, { manifest: baseManifest, version: 1 });
  assert.equal(twice.modified, false);
  assert.equal(twice.html, once.html);
});

test('leaves non-HTML content unchanged', () => {
  const xml = `<?xml version="1.0"?><rss><title>Feed</title></rss>`;
  const { modified } = injectPwaTags(xml, { manifest: baseManifest, version: 1 });
  assert.equal(modified, false);
});

test('honors a custom theme_color from shippie.json', () => {
  const { html } = injectPwaTags(SIMPLE_HTML, {
    manifest: { ...baseManifest, theme_color: '#8b5cf6' },
    version: 1,
  });
  assert.match(html, /name="theme-color"[^>]+content="#8b5cf6"/);
});

test('preserves existing elements in head and body', () => {
  const { html } = injectPwaTags(SIMPLE_HTML, { manifest: baseManifest, version: 1 });
  assert.match(html, /<title>Recipes<\/title>/);
  assert.match(html, /<h1>Hello<\/h1>/);
});

test('skips inline CSP by default (runtime CSP is primary)', () => {
  const { html } = injectPwaTags(SIMPLE_HTML, { manifest: baseManifest, version: 1 });
  assert.doesNotMatch(html, /Content-Security-Policy/i);
});

test('adds inline CSP when requested, with allowed_connect_domains', () => {
  const { html } = injectPwaTags(SIMPLE_HTML, {
    manifest: {
      ...baseManifest,
      allowed_connect_domains: ['api.stripe.com', 'api.openai.com'],
    },
    version: 1,
    injectInlineCsp: true,
  });
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /api\.stripe\.com/);
  assert.match(html, /api\.openai\.com/);
});
