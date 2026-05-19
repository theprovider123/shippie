import { describe, expect, test } from 'bun:test';
import { runConnectionGuardScan } from './connection-guard.ts';

const enc = new TextEncoder();

function files(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([path, body]) => [path, enc.encode(body)]));
}

describe('connection guard scan', () => {
  test('passes a fully local app with no external connections', () => {
    const report = runConnectionGuardScan(files({
      'index.html': '<main>Local notes</main>',
      'app.js': 'localStorage.setItem("note", text);',
    }));

    expect(report.passed).toBe(true);
    expect(report.connections).toEqual([]);
    expect(report.csp.connectSrc).toEqual([]);
  });

  test('detects reference-data reads and produces connect-src policy', () => {
    const report = runConnectionGuardScan(files({
      'weather.js': `
        const forecast = await fetch('https://api.weather.test/forecast?lat=51&lon=0');
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.connections[0]?.host).toBe('api.weather.test');
    expect(report.connections[0]?.destinations).toContain('connect');
    expect(report.csp.connectSrc).toEqual(['https://api.weather.test']);
  });

  test('allows external writes as high-risk disclosures', () => {
    const report = runConnectionGuardScan(files({
      'app.js': `
        await fetch('https://api.vendor.test/receipts', {
          method: 'POST',
          body: JSON.stringify(receipt)
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.findings.some((f) => f.id === 'external-write')).toBe(true);
    expect(report.findings.find((f) => f.id === 'external-write')?.severity).toBe('warn');
    expect(report.connections[0]?.risk).toBe('high');
    expect(report.csp.connectSrc).toEqual(['https://api.vendor.test']);
  });

  test('allows external AI providers as high-risk disclosures', () => {
    const report = runConnectionGuardScan(files({
      'ai.js': `
        await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          body: JSON.stringify({ input: note })
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.findings.some((f) => f.id === 'external-ai-provider')).toBe(true);
    expect(report.findings.find((f) => f.id === 'external-ai-provider')?.severity).toBe('warn');
    expect(report.connections[0]?.risk).toBe('high');
    expect(report.connections[0]?.requiresConsent).toBe(true);
    expect(report.csp.connectSrc).toEqual(['https://api.openai.com']);
  });

  test('allows third-party script hosts as high-risk disclosures and allows stylesheet/font assets in CSP', () => {
    const report = runConnectionGuardScan(files({
      'index.html': `
        <script src="https://cdn.example.com/tracker.js"></script>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
      `,
      'styles.css': `
        @font-face {
          font-family: Inter;
          src: url('https://fonts.gstatic.com/s/inter/v18/font.woff2') format('woff2');
        }
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.findings.some((f) => f.id === 'external-script')).toBe(true);
    expect(report.findings.find((f) => f.id === 'external-script')?.severity).toBe('warn');
    expect(report.csp.styleSrc).toEqual(['https://fonts.googleapis.com']);
    expect(report.csp.fontSrc).toEqual(['https://fonts.gstatic.com']);
    expect(report.csp.scriptSrc).toEqual(['https://cdn.example.com']);
  });

  test('still blocks known tracker and ad hosts', () => {
    const report = runConnectionGuardScan(files({
      'index.html': `
        <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
      `,
    }));

    expect(report.passed).toBe(false);
    expect(report.findings.some((f) => f.id === 'tracker-domain')).toBe(true);
    expect(report.csp.scriptSrc).toEqual([]);
  });

  test('ignores shippie metadata and allows shippie platform calls', () => {
    const report = runConnectionGuardScan(files({
      'shippie.json': JSON.stringify({
        $schema: 'https://shippie.app/schemas/app.json',
        source_repo: 'https://github.com/acme/app',
      }),
      'share.js': `
        await fetch('https://shippie.app/api/c', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.connections.map((c) => c.host)).toEqual(['shippie.app']);
    expect(report.csp.connectSrc).toEqual(['https://shippie.app']);
  });
});
