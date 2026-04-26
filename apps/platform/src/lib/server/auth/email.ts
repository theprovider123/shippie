/**
 * Magic-link email delivery.
 *
 * Production: POST to Resend API (https://api.resend.com/emails) using
 * RESEND_API_KEY. Dev: console.log the link with a banner so contributors
 * can sign in without SMTP credentials.
 *
 * Mirrors the existing template at apps/web/lib/auth/dev-email-provider.ts.
 */

export interface MagicLinkInput {
  to: string;
  url: string;
  env: {
    SHIPPIE_ENV?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
  };
}

const DEFAULT_FROM = 'Shippie <onboarding@resend.dev>';

export async function sendMagicLink({ to, url, env }: MagicLinkInput): Promise<void> {
  const flavor = env.SHIPPIE_ENV ?? 'development';
  const resendKey = env.RESEND_API_KEY?.trim();
  const from = env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM;

  if (resendKey) {
    await sendViaResend({ apiKey: resendKey, from, to, url });
    return;
  }

  if (flavor === 'production') {
    throw new Error('RESEND_API_KEY is required for email sign-in in production.');
  }

  // Dev/canary fallback — banner-print to the worker logs.
  // wrangler tail will pick this up; `vite dev` shows it inline.
  const banner = '='.repeat(72);
  console.log(`\n${banner}`);
  console.log('[shippie:auth] magic link');
  console.log(`  to:   ${to}`);
  console.log(`  from: ${from}`);
  console.log(`  link: ${url}`);
  console.log('  (paste the link into your browser to complete sign-in)');
  console.log(`${banner}\n`);
}

async function sendViaResend(input: { apiKey: string; from: string; to: string; url: string }): Promise<void> {
  const subject = 'Sign in to Shippie';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject,
      text: [
        'Sign in to Shippie',
        '',
        `Open this magic link to finish signing in: ${input.url}`,
        '',
        'If you did not request this email, you can ignore it.',
      ].join('\n'),
      html: renderMagicLinkHtml(input.url),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend delivery failed: ${res.status} ${await res.text()}`);
  }
}

export function renderMagicLinkHtml(url: string): string {
  const escapedUrl = escapeHtml(url);
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #14120F;">
      <h1 style="font-size: 28px; margin-bottom: 12px;">Sign in to Shippie</h1>
      <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
        Use the button below to finish signing in.
      </p>
      <p style="margin: 0 0 24px;">
        <a
          href="${escapedUrl}"
          style="display: inline-block; padding: 12px 20px; background: #E8603C; color: #14120F; text-decoration: none; font-weight: 700; border-radius: 999px;"
        >
          Sign in
        </a>
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #5C5751;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 14px; line-height: 1.5; word-break: break-all;">
        <a href="${escapedUrl}" style="color: #14120F;">${escapedUrl}</a>
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #5C5751;">
        If you did not request this email, you can safely ignore it.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
