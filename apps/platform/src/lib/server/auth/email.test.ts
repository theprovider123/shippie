import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { sendMagicLink, renderMagicLinkHtml } from './email';

const realLog = console.log;

let logLines: string[] = [];

beforeEach(() => {
  logLines = [];
  console.log = (...args: unknown[]) => {
    logLines.push(args.map((a) => String(a)).join(' '));
  };
});

afterEach(() => {
  console.log = realLog;
});

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

  it('throws in production when no email provider is configured', async () => {
    await expect(
      sendMagicLink({
        to: 'a@b.com',
        url: 'https://shippie.app/x',
        env: { SHIPPIE_ENV: 'production' },
      }),
    ).rejects.toThrow(/EMAIL binding/);
  });
});

describe('sendMagicLink — Cloudflare Email Service path', () => {
  it('sends through the EMAIL binding when configured', async () => {
    const sends: unknown[] = [];
    await sendMagicLink({
      to: 'a@b.com',
      url: 'https://shippie.app/x',
      env: {
        SHIPPIE_ENV: 'production',
        AUTH_EMAIL_FROM: 'Shippie <login@shippie.app>',
        EMAIL: {
          send: async (input) => {
            sends.push(input);
          },
        },
      },
    });

    expect(sends).toEqual([
      expect.objectContaining({
        to: 'a@b.com',
        from: 'Shippie <login@shippie.app>',
        subject: 'Sign in to Shippie',
        html: expect.stringContaining('https://shippie.app/x'),
        text: expect.stringContaining('https://shippie.app/x'),
      }),
    ]);
  });
});

describe('renderMagicLinkHtml', () => {
  it('escapes HTML in the URL', () => {
    const html = renderMagicLinkHtml('https://x.test/?<script>=1');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
