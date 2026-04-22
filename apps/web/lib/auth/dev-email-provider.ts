/**
 * Email provider for Auth.js v5.
 *
 * In production we deliver magic links through Resend. In local
 * development we keep the zero-config console fallback so contributors
 * can sign in without SMTP credentials.
 *
 * Spec v6 §2.2 (email adapter).
 */
import NodemailerProvider, { type NodemailerConfig } from 'next-auth/providers/nodemailer';

const DEFAULT_FROM = 'Shippie <onboarding@resend.dev>';

export function emailProvider(): NodemailerConfig {
  // next-auth's nodemailer provider requires a `server` config value
  // even when we override sendVerificationRequest. Pass a dummy.
  return NodemailerProvider({
    server: 'smtp://localhost:1',
    from: process.env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM,
    // Important: the email provider only works with database sessions.
    // See apps/web/lib/auth/index.ts — session.strategy = 'database'.
    async sendVerificationRequest({ identifier, url, provider }) {
      const resendApiKey = process.env.RESEND_API_KEY?.trim();
      if (resendApiKey) {
        await sendViaResend({
          apiKey: resendApiKey,
          to: identifier,
          from: provider.from,
          url,
        });
        return;
      }

      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'RESEND_API_KEY is required for email sign-in in production.',
        );
      }

      console.log('\n' + '='.repeat(72));
      console.log('[shippie:auth] Sign-in magic link');
      console.log(`  to:    ${identifier}`);
      console.log(`  from:  ${provider.from}`);
      console.log(`  link:  ${url}`);
      console.log('  (paste the link into your browser to complete sign-in)');
      console.log('='.repeat(72) + '\n');
    },
  }) as NodemailerConfig;
}

async function sendViaResend(input: {
  apiKey: string;
  to: string;
  from?: string;
  url: string;
}) {
  const subject = 'Sign in to Shippie';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from || DEFAULT_FROM,
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

  if (!response.ok) {
    throw new Error(`Resend delivery failed: ${response.status} ${await response.text()}`);
  }
}

function renderMagicLinkHtml(url: string): string {
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
