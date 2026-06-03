/**
 * Magic-link email delivery.
 *
 * Production: send through the Cloudflare Email Service EMAIL binding. Dev:
 * console.log the link with a banner so contributors can sign in locally.
 *
 * Mirrors the existing template at apps/web/lib/auth/dev-email-provider.ts.
 */

export interface MagicLinkInput {
  to: string;
  url: string;
  env: {
    EMAIL?: CloudflareEmailBinding;
    SHIPPIE_ENV?: string;
    AUTH_EMAIL_FROM?: string;
  };
}

interface CloudflareEmailBinding {
  send(input: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

const DEFAULT_FROM = 'Shippie <login@shippie.app>';
const MAGIC_LINK_SUBJECT = 'Sign in to Shippie';

export async function sendMagicLink({ to, url, env }: MagicLinkInput): Promise<void> {
  const flavor = env.SHIPPIE_ENV ?? 'development';
  const from = env.AUTH_EMAIL_FROM?.trim() || DEFAULT_FROM;
  const text = renderMagicLinkText(url);
  const html = renderMagicLinkHtml(url);

  if (env.EMAIL) {
    await sendViaCloudflareEmail({ email: env.EMAIL, from, to, text, html });
    return;
  }

  if (flavor === 'production') {
    throw new Error('Cloudflare EMAIL binding is required for email sign-in in production.');
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

async function sendViaCloudflareEmail(input: {
  email: CloudflareEmailBinding;
  from: string;
  to: string;
  text: string;
  html: string;
}): Promise<void> {
  await input.email.send({
    to: input.to,
    from: input.from,
    subject: MAGIC_LINK_SUBJECT,
    text: input.text,
    html: input.html,
  });
}

function renderMagicLinkText(url: string): string {
  return [
    'Sign in to Shippie',
    '',
    'If Shippie is installed, your device may open the app automatically.',
    '',
    `Open this magic link to finish signing in: ${url}`,
    '',
    'If you did not request this email, you can ignore it.',
  ].join('\n');
}

export function renderMagicLinkHtml(url: string): string {
  const escapedUrl = escapeHtml(url);
  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #14120F;">
      <h1 style="font-size: 28px; margin-bottom: 12px;">Sign in to Shippie</h1>
      <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
        Use the button below to finish signing in. If Shippie is installed, your device may open the app automatically.
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
