import { describe, expect, test } from 'bun:test';
import { runSecurityScan } from './security-scan.ts';

const enc = new TextEncoder();
const file = (s: string) => enc.encode(s);

describe('runSecurityScan — secrets', () => {
  test('JWT-shaped token fires secret_supabase_anon (warn)', () => {
    const files = new Map([
      [
        'src/db.ts',
        file(
          `const supabase = createClient(url, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")`,
        ),
      ],
    ]);
    const report = runSecurityScan(files);
    const f = report.findings.find((x) => x.rule === 'secret_supabase_anon');
    expect(f).toBeTruthy();
    expect(f?.severity).toBe('warn');
    expect(f?.snippet).toContain('…');
    expect(f?.snippet).not.toContain('dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
  });

  test('AWS access key fires block-severity', () => {
    const files = new Map([['src/storage.ts', file('const k = "AKIAIOSFODNN7EXAMPLE";')]]);
    const report = runSecurityScan(files);
    const f = report.findings.find((x) => x.rule === 'secret_aws_access_key');
    expect(f?.severity).toBe('block');
    expect(report.blocks).toBeGreaterThan(0);
  });

  test('Stripe secret key fires block', () => {
    // Synthetic shape — matches the regex without being a real key. GitHub's
    // secret scanner is aggressive about stripe-looking strings even in tests.
    const files = new Map([['src/pay.ts', file('"sk_live_FAKEFAKEFAKEFAKEFAKE000"')]]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'secret_stripe_key' && x.severity === 'block')).toBe(true);
  });

  test('GitHub PAT fires block', () => {
    const files = new Map([
      ['src/gh.ts', file('const tok = "ghp_abcdef0123456789ABCDEF0123456789ABCD";')],
    ]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'secret_github_token')).toBe(true);
  });

  test('OpenAI / sk- key fires block', () => {
    const files = new Map([
      ['src/ai.ts', file('"sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ"')],
    ]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'secret_openai_key')).toBe(true);
  });

  test('Firebase API key fires warn', () => {
    const files = new Map([
      ['src/fb.ts', file('apiKey: "AIzaSyBNlBGihwBvSnXYzpWqRsTuVwXyZaBcDeFg"')],
    ]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'secret_firebase_apikey')).toBe(true);
  });

  test('repeated identical secret deduped to one finding', () => {
    const repeated = '"sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ"';
    const files = new Map([
      ['chunk-1.js', file(`${repeated}\n${repeated}\n${repeated}`)],
    ]);
    const report = runSecurityScan(files);
    const openai = report.findings.filter((x) => x.rule === 'secret_openai_key');
    expect(openai.length).toBe(1);
  });

  test('no secrets in clean file', () => {
    const files = new Map([['src/index.html', file('<html><body>Hello</body></html>')]]);
    const report = runSecurityScan(files);
    expect(report.findings.filter((f) => f.rule.startsWith('secret_')).length).toBe(0);
  });
});

describe('runSecurityScan — markup hygiene', () => {
  test('inline event handlers fire info finding', () => {
    const files = new Map([
      ['index.html', file('<button onclick="doIt()">x</button><div onmouseover="hi()" />')],
    ]);
    const report = runSecurityScan(files);
    const f = report.findings.find((x) => x.rule === 'inline_event_handler');
    expect(f).toBeTruthy();
    expect(f?.severity).toBe('info');
  });

  test('javascript: URIs fire warn', () => {
    const files = new Map([['index.html', file('<a href="javascript:void(0)">x</a>')]]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'javascript_uri' && x.severity === 'warn')).toBe(true);
  });

  test('mixed content (http://) fires warn', () => {
    const files = new Map([
      ['index.html', file('<img src="http://example.com/x.png"><link href="http://a/b.css">')],
    ]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'mixed_content')).toBe(true);
  });

  test('external script from unknown host fires warn', () => {
    const files = new Map([
      ['index.html', file('<script src="https://tracker.evil/track.js"></script>')],
    ]);
    const report = runSecurityScan(files);
    const f = report.findings.find((x) => x.rule === 'external_script_unknown_host');
    expect(f).toBeTruthy();
    expect(f?.snippet).toContain('tracker.evil');
  });

  test('trusted CDN external script does not fire', () => {
    const files = new Map([
      ['index.html', file('<script src="https://cdn.jsdelivr.net/npm/whatever@1/dist/x.js"></script>')],
    ]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'external_script_unknown_host')).toBe(false);
  });

  test('relative script src does not fire external check', () => {
    const files = new Map([['index.html', file('<script src="/app.js"></script>')]]);
    const report = runSecurityScan(files);
    expect(report.findings.some((x) => x.rule === 'external_script_unknown_host')).toBe(false);
  });
});

describe('runSecurityScan — coverage', () => {
  test('skips binary / media files', () => {
    const files = new Map([
      ['index.html', file('<html></html>')],
      ['favicon.ico', new Uint8Array([0, 0, 1, 0, 1, 0])],
      ['photo.jpg', new Uint8Array([0xff, 0xd8, 0xff])],
    ]);
    const report = runSecurityScan(files);
    expect(report.scannedFiles).toBe(1);
  });
});
