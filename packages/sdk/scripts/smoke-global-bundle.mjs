#!/usr/bin/env node
/**
 * Smoke-test the browser IIFE that Shippie serves from /__shippie/sdk.js.
 *
 * This catches a subtle class of regressions where the bundler's global
 * export namespace overwrites `window.shippie` after src/index.ts attaches
 * the real SDK object.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';

const bundlePath = resolve('dist/index.global.global.js');
const source = readFileSync(bundlePath, 'utf8');
const win = new Window({ url: 'https://demo.shippie.app/' });
const fetchCalls = [];

Object.defineProperty(win.navigator, 'userAgent', {
  value:
    'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  configurable: true,
});

const fakeFetch = async (url) => {
  const href = String(url);
  fetchCalls.push(href);
  if (href.includes('/__shippie/meta')) {
    return {
      ok: true,
      json: async () => ({
        slug: 'demo',
        workflow_probes: ['/done'],
        allowed_connect_domains: ['api.example.com'],
      }),
    };
  }
  if (href.includes('/api/v1/proof')) {
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
Object.defineProperty(globalThis, 'document', {
  value: win.document,
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: win.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: win.localStorage,
  configurable: true,
});
Object.defineProperty(globalThis, 'location', {
  value: win.location,
  configurable: true,
});
Object.defineProperty(globalThis, 'fetch', {
  value: fakeFetch,
  configurable: true,
});
win.fetch = fakeFetch;

eval(source);

await Promise.resolve();
await Promise.resolve();

const sdk = win.shippie;
if (!sdk || sdk.version !== '2.0.0' || !sdk.install || !sdk.local) {
  console.error('[sdk smoke] window.shippie is not the browser SDK object');
  console.error('[sdk smoke] observed keys:', sdk ? Object.keys(sdk) : sdk);
  process.exit(1);
}

if (!fetchCalls.some((href) => href.includes('/__shippie/meta'))) {
  console.error('[sdk smoke] global bundle did not request /__shippie/meta on boot');
  console.error('[sdk smoke] fetch calls:', fetchCalls);
  process.exit(1);
}

console.log('[sdk smoke] index.global exposes window.shippie runtime');
process.exit(0);
