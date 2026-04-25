import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, SHIPPIE_AI_FRAME_ORIGIN } from './csp-builder';

test('default CSP has connect-src self only', () => {
  const r = buildCsp({});
  assert.ok(r.header.includes("connect-src 'self'"));
  // Only https:// allowed in the default header is the Shippie AI iframe
  // (frame-src). connect-src must remain self-only.
  const connectMatch = /connect-src ([^;]+)/.exec(r.header);
  assert.ok(connectMatch, 'connect-src directive missing');
  assert.ok(!connectMatch[1].includes('https://'), 'connect-src must be self-only by default');
});

test('external_network adds allowed domains to connect-src', () => {
  const r = buildCsp({
    externalNetworkEnabled: true,
    allowedConnectDomains: ['api.stripe.com', 'api.openai.com'],
  });
  assert.ok(r.header.includes('https://api.stripe.com'));
  assert.ok(r.header.includes('https://api.openai.com'));
  assert.deepEqual(r.connectSrc, ["'self'", 'https://api.stripe.com', 'https://api.openai.com']);
});

test('frame-ancestors none is always present', () => {
  const r = buildCsp({ externalNetworkEnabled: true, allowedConnectDomains: ['x.com'] });
  assert.ok(r.header.includes("frame-ancestors 'none'"));
});

test('metaTag wraps header in meta element', () => {
  const r = buildCsp({});
  assert.ok(r.metaTag.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(r.metaTag.includes(r.header.replace(/"/g, '&quot;')));
});

test('empty allowedConnectDomains with external_network produces only self', () => {
  const r = buildCsp({ externalNetworkEnabled: true, allowedConnectDomains: [] });
  assert.deepEqual(r.connectSrc, ["'self'"]);
});

test('frame-src allows the Shippie AI iframe by default', () => {
  const r = buildCsp({});
  assert.ok(r.header.includes(`frame-src ${SHIPPIE_AI_FRAME_ORIGIN}`));
  assert.deepEqual(r.frameSrc, [SHIPPIE_AI_FRAME_ORIGIN]);
});

test('SHIPPIE_AI_FRAME_ORIGIN is the canonical https://ai.shippie.app', () => {
  assert.equal(SHIPPIE_AI_FRAME_ORIGIN, 'https://ai.shippie.app');
});

test('frame-src adds extra allowed frame origins additively, deduped', () => {
  const r = buildCsp({
    allowedFrameOrigins: ['https://embed.example.com', 'https://ai.shippie.app'],
  });
  assert.deepEqual(r.frameSrc, ['https://ai.shippie.app', 'https://embed.example.com']);
  assert.ok(r.header.includes('frame-src https://ai.shippie.app https://embed.example.com'));
});

test('frame-src does not affect frame-ancestors (still none)', () => {
  const r = buildCsp({ allowedFrameOrigins: ['https://embed.example.com'] });
  assert.ok(r.header.includes("frame-ancestors 'none'"));
});
