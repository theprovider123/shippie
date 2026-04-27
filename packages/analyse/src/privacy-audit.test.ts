import { describe, expect, test } from 'bun:test';
import { classifyDomain, runPrivacyAudit } from './privacy-audit.ts';

const enc = new TextEncoder();
const file = (s: string) => enc.encode(s);

describe('classifyDomain', () => {
  test('Google Analytics is a tracker', () => {
    expect(classifyDomain('www.google-analytics.com').category).toBe('tracker');
  });
  test('googletagmanager.com subdomain is a tracker', () => {
    expect(classifyDomain('gtm.googletagmanager.com').category).toBe('tracker');
  });
  test('Sentry is a tracker', () => {
    expect(classifyDomain('o12345.ingest.sentry.io').category).toBe('tracker');
  });
  test('jsdelivr is a CDN', () => {
    expect(classifyDomain('cdn.jsdelivr.net').category).toBe('cdn');
  });
  test('shippie.app is shippie infra', () => {
    expect(classifyDomain('palate.shippie.app').category).toBe('shippie');
  });
  test('app self-host treated as same-origin', () => {
    expect(classifyDomain('palate.shippie.app', { appHost: 'palate.shippie.app' }).category).toBe(
      'same-origin',
    );
  });
  test('declared feature domain comes through as feature', () => {
    expect(
      classifyDomain('api.openweathermap.org', {
        allowedFeatureDomains: ['api.openweathermap.org'],
      }).category,
    ).toBe('feature');
  });
  test('undeclared domain is unknown', () => {
    expect(classifyDomain('mystery.example.com').category).toBe('unknown');
  });
});

describe('runPrivacyAudit', () => {
  test('extracts and classifies multiple domains', () => {
    const files = new Map([
      [
        'index.html',
        file(
          `<script src="https://cdn.jsdelivr.net/x.js"></script>` +
            `<script src="https://www.google-analytics.com/analytics.js"></script>` +
            `<a href="https://api.openweathermap.org/forecast">w</a>`,
        ),
      ],
      [
        'src/app.js',
        file(`fetch("https://random.evil.example/")`),
      ],
    ]);
    const report = runPrivacyAudit(files, {
      allowedFeatureDomains: ['api.openweathermap.org'],
    });
    expect(report.counts.tracker).toBeGreaterThan(0);
    expect(report.counts.cdn).toBeGreaterThan(0);
    expect(report.counts.feature).toBeGreaterThan(0);
    expect(report.counts.unknown).toBeGreaterThan(0);
    expect(report.domains[0]?.category).toBe('tracker'); // sorted to top
  });

  test('aggregates occurrences across files', () => {
    const files = new Map([
      ['a.html', file('https://www.google-analytics.com/x.js')],
      ['b.html', file('https://www.google-analytics.com/y.js')],
      ['c.js', file('"https://www.google-analytics.com/track" ')],
    ]);
    const report = runPrivacyAudit(files);
    const ga = report.domains.find((d) => d.host === 'www.google-analytics.com');
    expect(ga).toBeTruthy();
    expect(ga?.occurrences).toBe(3);
    expect(ga?.files.length).toBe(3);
  });

  test('skips media + binary files', () => {
    const files = new Map([
      ['index.html', file('<html></html>')],
      ['photo.jpg', new Uint8Array([0xff, 0xd8, 0xff])],
    ]);
    const report = runPrivacyAudit(files);
    expect(report.scannedFiles).toBe(1);
  });

  test('app self-host suppressed when appHost provided', () => {
    const files = new Map([
      [
        'index.html',
        file('<script src="https://palate.shippie.app/_app/x.js"></script>'),
      ],
    ]);
    const report = runPrivacyAudit(files, { appHost: 'palate.shippie.app' });
    expect(report.counts['same-origin']).toBe(1);
    expect(report.counts.shippie).toBe(0);
  });
});
