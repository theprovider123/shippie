import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { sendMagicLink, renderMagicLinkHtml } from './email';

const realFetch = globalThis.fetch;
const realLog = console.log;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

let fetchCalls: FetchCall[] = [];
let logLines: string[] = [];

beforeEach(() => {
  fetchCalls = [];
  logLines = [];
  console.log = (...args: unknown[]) => {
    logLines.push(args.map((a) => String(a)).join(' '));
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

function mockFetch(response: Response) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: typeof input === 'string' ? input : input.toString(), init });
    return response;
  }) as typeof fetch;
}

describe('sendMagicLink — dev fallback', () => {
  it('logs to console with banner when no API key is set in dev', async () => {
    await sendMagicLink({
      to: 'maker@example.com',
      url: 'https://shippie.app/auth/email-link/abc.def',
      env: { SHIPPIE_ENV: 'development' },
    });
    const joined = logLines.join('\n');
    expect(joined).toContain('[shippie:auth] magic link');
    expect(joined).toContain('maker@example.com');
    expect(joined).toContain('https://shippie.app/auth/email-link/abc.def');
  });

  it('throws in production when RESEND_API_KEY missing', async () => {
    await expect(
      sendMagicLink({
        to: 'a@b.com',
        url: 'https://shippie.app/x',
        env: { SHIPPIE_ENV: 'production' },
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe('sendMagicLink — Resend path', () => {
  it('POSTs to api.resend.com with the configured key', async () => {
    mockFetch(new Response('{"id":"x"}', { status: 200 }));
    await sendMagicLink({
      to: 'a@b.com',
      url: 'https://shippie.app/x',
      env: { SHIPPIE_ENV: 'production', RESEND_API_KEY: 're_test_xxx' },
    });
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('https://api.resend.com/emails');
    const headers = (fetchCalls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_xxx');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse(String(fetchCalls[0].init?.body));
    expect(body.to).toEqual(['a@b.com']);
    expect(body.subject).toBe('Sign in to Shippie');
    expect(body.html).toContain('https://shippie.app/x');
  });

  it('throws on Resend non-2xx', async () => {
    mockFetch(new Response('{"error":"bad"}', { status: 400 }));
    await expect(
      sendMagicLink({
        to: 'a@b.com',
        url: 'https://shippie.app/x',
        env: { SHIPPIE_ENV: 'production', RESEND_API_KEY: 'k' },
      }),
    ).rejects.toThrow(/Resend delivery failed/);
  });
});

describe('renderMagicLinkHtml', () => {
  it('escapes HTML in the URL', () => {
    const html = renderMagicLinkHtml('https://x.test/?<script>=1');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
