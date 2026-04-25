import { describe, expect, test } from 'bun:test';
import { scanJs } from './js-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('scanJs', () => {
  test('detects React via react + createElement', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`import {createElement} from 'react'; createElement('div', null, 'hi');`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('react');
    expect(result.version).toBe(null);
    expect(result.hasRouter).toBe(false);
    expect(result.hasServiceWorker).toBe(false);
  });

  test('does not detect React without createElement', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`// just mentions react in a comment`));
    const result = scanJs(files);
    expect(result.name).not.toBe('react');
  });

  test('detects Vue via __vue__ marker', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.mjs', enc(`window.__vue__ = something();`));
    const result = scanJs(files);
    expect(result.name).toBe('vue');
  });

  test('detects Vue 3 via createApp(', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'main.js',
      enc(`import { createApp } from 'vue'; createApp(App).mount('#app');`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('vue');
  });

  test('detects Vue via Vue.createApp pattern', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`Vue.createApp({}).mount('#app');`));
    const result = scanJs(files);
    expect(result.name).toBe('vue');
  });

  test('detects Svelte via svelte/internal', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`import { init } from 'svelte/internal';`));
    const result = scanJs(files);
    expect(result.name).toBe('svelte');
  });

  test('detects Svelte via __svelte marker', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.mjs', enc(`window.__svelte = { components: [] };`));
    const result = scanJs(files);
    expect(result.name).toBe('svelte');
  });

  test('detects Preact when no React or Vue match', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`import { h } from 'preact';`));
    const result = scanJs(files);
    expect(result.name).toBe('preact');
  });

  test('prefers React over Preact when both present', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`import { createElement } from 'react'; import { h } from 'preact';`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('react');
  });

  test('prefers Vue over Preact when both present', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`window.__vue__ = 1; import { h } from 'preact';`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('vue');
  });

  test('returns vanilla when only HTML present and no JS', () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<html><body>Hi</body></html>`));
    const result = scanJs(files);
    expect(result.name).toBe('vanilla');
  });

  test('returns wasm when no framework matched but .wasm present', () => {
    const files = new Map<string, Uint8Array>();
    files.set('module.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d]));
    files.set('loader.js', enc(`fetch('/module.wasm').then(WebAssembly.instantiateStreaming);`));
    const result = scanJs(files);
    expect(result.name).toBe('wasm');
  });

  test('framework wins over wasm when both present', () => {
    const files = new Map<string, Uint8Array>();
    files.set('module.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d]));
    files.set('app.js', enc(`import { createElement } from 'react';`));
    const result = scanJs(files);
    expect(result.name).toBe('react');
  });

  test('returns null when no JS, no HTML, no WASM', () => {
    const files = new Map<string, Uint8Array>();
    files.set('readme.txt', enc(`hello`));
    const result = scanJs(files);
    expect(result.name).toBe(null);
  });

  test('detects react-router as hasRouter', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`import { createElement } from 'react'; import {BrowserRouter} from 'react-router';`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('react');
    expect(result.hasRouter).toBe(true);
  });

  test('detects vue-router as hasRouter', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`import VueRouter from 'vue-router'; createApp(App);`));
    const result = scanJs(files);
    expect(result.hasRouter).toBe(true);
  });

  test('detects svelte-routing as hasRouter', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`import { Router } from 'svelte-routing'; import {} from 'svelte/internal';`),
    );
    const result = scanJs(files);
    expect(result.hasRouter).toBe(true);
  });

  test('detects @solidjs/router as hasRouter', () => {
    const files = new Map<string, Uint8Array>();
    files.set('app.js', enc(`import { Router } from '@solidjs/router';`));
    const result = scanJs(files);
    expect(result.hasRouter).toBe(true);
  });

  test('detects service worker registration', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'app.js',
      enc(`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`),
    );
    const result = scanJs(files);
    expect(result.hasServiceWorker).toBe(true);
  });

  test('vanilla can still report router and SW', () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<html></html>`));
    const result = scanJs(files);
    expect(result.name).toBe('vanilla');
    expect(result.hasRouter).toBe(false);
    expect(result.hasServiceWorker).toBe(false);
  });

  test('scans .mjs files too', () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'main.mjs',
      enc(`import { createElement } from 'react'; navigator.serviceWorker.register('/sw.js');`),
    );
    const result = scanJs(files);
    expect(result.name).toBe('react');
    expect(result.hasServiceWorker).toBe(true);
  });
});
