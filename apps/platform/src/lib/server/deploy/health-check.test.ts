import { describe, expect, test } from 'vitest';
import { runHealthCheck } from './health-check';

const enc = new TextEncoder();
const file = (s: string) => enc.encode(s);

describe('runHealthCheck — index.html', () => {
  test('fails when index.html missing', () => {
    const report = runHealthCheck(new Map());
    expect(report.passed).toBe(false);
    expect(report.items[0].id).toBe('index_html');
    expect(report.items[0].severity).toBe('fail');
  });

  test('passes minimal index.html', () => {
    const files = new Map([
      ['index.html', file('<!DOCTYPE html><html><head></head><body></body></html>')],
    ]);
    const report = runHealthCheck(files);
    expect(report.passed).toBe(true);
    expect(report.items.find((i) => i.id === 'index_html')?.severity).toBe('ok');
  });
});

describe('runHealthCheck — manifest', () => {
  test('reports manifest missing as ok (wrapper synthesizes)', () => {
    const files = new Map([['index.html', file('<html></html>')]]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'manifest_present')?.severity).toBe('ok');
  });

  test('warns on incomplete manifest', () => {
    const files = new Map([
      ['index.html', file('<html></html>')],
      ['manifest.json', file('{"name":"X"}')],
    ]);
    const report = runHealthCheck(files);
    const item = report.items.find((i) => i.id === 'manifest_valid');
    expect(item?.severity).toBe('warn');
    expect(item?.title).toContain('icons');
    expect(item?.title).toContain('start_url');
  });

  test('passes on complete manifest', () => {
    const files = new Map([
      ['index.html', file('<html></html>')],
      [
        'manifest.json',
        file(
          JSON.stringify({
            name: 'X',
            icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }],
            start_url: '/',
            display: 'standalone',
          }),
        ),
      ],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'manifest_valid')?.severity).toBe('ok');
  });

  test('fails on broken manifest JSON', () => {
    const files = new Map([
      ['index.html', file('<html></html>')],
      ['manifest.json', file('{not json')],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'manifest_valid')?.severity).toBe('fail');
    expect(report.passed).toBe(false);
  });
});

describe('runHealthCheck — service worker', () => {
  test('warns when SW file missing but registered', () => {
    const files = new Map([
      [
        'index.html',
        file(`<html><head><script>navigator.serviceWorker.register('/sw.js')</script></head></html>`),
      ],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'sw_registration')?.severity).toBe('warn');
  });

  test('ok when wrapper SW is referenced', () => {
    const files = new Map([
      [
        'index.html',
        file(
          `<html><head><script>navigator.serviceWorker.register('/__shippie/sw.js')</script></head></html>`,
        ),
      ],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'sw_registration')?.severity).toBe('ok');
  });

  test('ok when no SW registration (Shippie wrapper provides)', () => {
    const files = new Map([['index.html', file('<html></html>')]]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'sw_registration')?.severity).toBe('ok');
  });
});

describe('runHealthCheck — asset resolution', () => {
  test('warns on broken script src', () => {
    const files = new Map([
      ['index.html', file('<html><head><script src="/missing.js"></script></head></html>')],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'asset_resolution')?.severity).toBe('warn');
  });

  test('ok when script + link resolve', () => {
    const files = new Map([
      [
        'index.html',
        file(
          '<html><head><link rel="stylesheet" href="/app.css"><script src="/app.js"></script></head></html>',
        ),
      ],
      ['app.js', file('console.log(1)')],
      ['app.css', file('body{}')],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'asset_resolution')?.severity).toBe('ok');
  });

  test('skips external script src', () => {
    const files = new Map([
      [
        'index.html',
        file('<html><head><script src="https://cdn.jsdelivr.net/x.js"></script></head></html>'),
      ],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'asset_resolution')?.severity).toBe('ok');
  });

  test('skips /__shippie/ links since wrapper serves them', () => {
    const files = new Map([
      ['index.html', file('<html><head><link rel="manifest" href="/__shippie/manifest"></head></html>')],
    ]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'asset_resolution')?.severity).toBe('ok');
  });
});

describe('runHealthCheck — installability meta', () => {
  test('warns on missing viewport / manifest / theme-color', () => {
    const files = new Map([['index.html', file('<html><head></head></html>')]]);
    const report = runHealthCheck(files);
    const item = report.items.find((i) => i.id === 'installable_meta');
    expect(item?.severity).toBe('warn');
    expect(item?.title).toContain('viewport');
    expect(item?.title).toContain('manifest');
    expect(item?.title).toContain('theme-color');
  });

  test('ok when all hints present', () => {
    const html =
      '<html><head>' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<link rel="manifest" href="/manifest.json">' +
      '<meta name="theme-color" content="#E8603C">' +
      '</head></html>';
    const files = new Map([['index.html', file(html)]]);
    const report = runHealthCheck(files);
    expect(report.items.find((i) => i.id === 'installable_meta')?.severity).toBe('ok');
  });
});
