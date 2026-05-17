import { describe, expect, test } from 'vitest';
import {
  checkArcadePurity,
  checkArcadeConnectDomains,
  PATTERNS_VERSION,
} from './arcade-purity-check';

const enc = (s: string) => new TextEncoder().encode(s);

function fixture(...entries: Array<[string, string]>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [path, body] of entries) m.set(path, enc(body));
  return m;
}

describe('checkArcadePurity', () => {
  test('clean bundle passes', () => {
    const r = checkArcadePurity(
      fixture(
        ['index.html', '<!doctype html><body><div id="root"></div></body>'],
        ['app.js', 'export function add(a, b) { return a + b; }'],
        ['style.css', 'body{font-family:Inter;}'],
      ),
    );
    expect(r.ok).toBe(true);
    expect(r.offences).toEqual([]);
    expect(r.patternsVersion).toBe(PATTERNS_VERSION);
    expect(r.filesScanned).toBe(3);
  });

  test('blocks google-analytics in HTML', () => {
    const r = checkArcadePurity(
      fixture([
        'index.html',
        '<script src="https://www.google-analytics.com/analytics.js"></script>',
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.offences[0]).toMatchObject({
      file: 'index.html',
      pattern: 'google-analytics',
      kind: 'analytics',
      line: 1,
    });
  });

  test('blocks Stripe Checkout (IAP)', () => {
    const r = checkArcadePurity(
      fixture(['app.js', 'window.location = "https://checkout.stripe.com/pay";']),
    );
    expect(r.ok).toBe(false);
    expect(r.offences[0]?.pattern).toBe('stripe checkout');
    expect(r.offences[0]?.kind).toBe('iap');
  });

  test('blocks Sentry beacon (crash-beacon)', () => {
    const r = checkArcadePurity(
      fixture(['init.js', 'Sentry.init({dsn:"https://xxx@o123.ingest.sentry.io/456"})']),
    );
    expect(r.ok).toBe(false);
    expect(r.offences[0]?.kind).toBe('crash-beacon');
  });

  test('reports multiple distinct patterns in a single file', () => {
    const r = checkArcadePurity(
      fixture([
        'tracker.js',
        'fbq("init", "1"); gtag("config", "G-X");',
      ]),
    );
    expect(r.ok).toBe(false);
    const labels = r.offences.map((o) => o.pattern).sort();
    expect(labels).toContain('facebook-pixel');
    expect(labels).toContain('gtag()');
  });

  test('skips binary files (NUL byte heuristic)', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const m = new Map<string, Uint8Array>();
    m.set('icon.png', png);
    const r = checkArcadePurity(m);
    expect(r.ok).toBe(true);
    expect(r.filesScanned).toBe(0); // png skipped via extension
  });

  test('skips unrecognised extensions', () => {
    const r = checkArcadePurity(
      fixture(['blob.bin', 'google-analytics.com — but in a binary blob']),
    );
    expect(r.ok).toBe(true); // .bin not in SCANNABLE_EXTENSIONS
  });

  test('reports correct line number in multi-line files', () => {
    const r = checkArcadePurity(
      fixture([
        'app.js',
        'const x = 1;\nconst y = 2;\nfetch("https://api.mixpanel.com/track");\n',
      ]),
    );
    expect(r.ok).toBe(false);
    expect(r.offences[0]?.line).toBe(3);
  });
});

describe('checkArcadeConnectDomains', () => {
  test('empty list passes', () => {
    expect(checkArcadeConnectDomains([])).toEqual({ ok: true });
    expect(checkArcadeConnectDomains(undefined)).toEqual({ ok: true });
  });

  test('shippie.app + subdomains pass', () => {
    expect(checkArcadeConnectDomains(['shippie.app', 'signal.shippie.app'])).toEqual({
      ok: true,
    });
  });

  test('protocols and ports are stripped before checking', () => {
    expect(
      checkArcadeConnectDomains([
        'wss://shippie.app',
        'https://signal.shippie.app:443/path',
      ]),
    ).toEqual({ ok: true });
  });

  test('external hosts are flagged', () => {
    const r = checkArcadeConnectDomains(['evil.example.com', 'shippie.app']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.offences).toEqual(['evil.example.com']);
  });

  test('look-alike host (shippie-app.com) is blocked', () => {
    const r = checkArcadeConnectDomains(['shippie-app.com']);
    expect(r.ok).toBe(false);
  });
});
