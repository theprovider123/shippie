/**
 * Dev email provider for Auth.js v5.
 *
 * Instead of wiring an SMTP server in development, this provider just
 * console.logs the magic link. Paste it into your browser to sign in.
 * Database sessions work identically to production.
 *
 * To swap in real email delivery, replace the sendVerificationRequest
 * callback with a Resend / SES / Postmark call and gate by env var.
 *
 * Spec v6 §2.2 (email adapter).
 */
import NodemailerProvider, { type NodemailerConfig } from 'next-auth/providers/nodemailer';

export function devEmailProvider(): NodemailerConfig {
  // next-auth's nodemailer provider requires a `server` config value
  // even when we override sendVerificationRequest. Pass a dummy.
  return NodemailerProvider({
    server: 'smtp://localhost:1',
    from: 'no-reply@shippie.local',
    // Important: the email provider only works with database sessions.
    // See apps/web/lib/auth/index.ts — session.strategy = 'database'.
    async sendVerificationRequest({ identifier, url, provider }) {
      const isLive = Boolean(process.env.RESEND_API_KEY);
      if (isLive) {
        // TODO(week 11): swap in real Resend delivery.
        console.warn(
          '[shippie:auth] RESEND_API_KEY set but live delivery not wired yet — falling back to console.',
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
