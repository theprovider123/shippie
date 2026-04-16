import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp } from './csp-builder';

test('default CSP has connect-src self only', () => {
  const r = buildCsp({});
  assert.ok(r.header.includes("connect-src 'self'"));
  assert.ok(!r.header.includes('https://'));
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
