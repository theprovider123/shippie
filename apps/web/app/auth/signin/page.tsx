/**
 * /auth/signin — magic-link sign-in page.
 *
 * Enters an email, Auth.js emails (or console-logs in dev) a magic link,
 * clicking the link creates a database session and redirects home.
 *
 * In dev (NODE_ENV !== 'production') we also render a one-click
 * "Sign in as admin" button that hits /api/auth/dev-signin and establishes
 * a session for the first email in ADMIN_EMAILS — no magic-link dance.
 *
 * Week 4 will replace this with the real platform sign-in UX including
 * GitHub/Google/Apple buttons.
 */
import Link from 'next/link';
import { signIn } from '@/lib/auth';
import { SiteNav } from '@/app/components/site-nav';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const isDev = process.env.NODE_ENV !== 'production';
  const adminEmail = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim() ?? '';
  const { return_to: returnTo } = await searchParams;

  async function sendMagicLink(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;
    await signIn('nodemailer', {
      email,
      redirectTo: '/dashboard',
    });
  }

  return (
    <>
      <SiteNav />
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))' }}
      >
        <div className="w-full max-w-md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <Link
              href="/"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--sunset)',
              }}
            >
              ← shippie.app
            </Link>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Sign in to Shippie
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              We&apos;ll send you a magic link. No password.
            </p>
          </div>

          <form action={sendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <label style={{ display: 'block' }}>
              <span className="sr-only">Email address</span>
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 1.25rem',
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  outline: 'none',
                }}
              />
            </label>
            <button type="submit" className="btn-primary" style={{ width: '100%', height: 48, justifyContent: 'center' }}>
              Send magic link
            </button>
          </form>

          {isDev && adminEmail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <span style={{ flex: 1, borderTop: '1px solid var(--border-light)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-light)' }}>or</span>
                <span style={{ flex: 1, borderTop: '1px solid var(--border-light)' }} />
              </div>
              <a
                href={`/api/auth/dev-signin${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`}
                className="btn-secondary"
                style={{ width: '100%', height: 48, justifyContent: 'center' }}
              >
                Dev: sign in as {adminEmail}
              </a>
              <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-light)' }}>
                one-click · only available when NODE_ENV !== production
              </p>
            </div>
          )}

          <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-light)' }}>
            {isDev ? 'dev mode · link prints to your terminal' : 'magic link sent by email'}
          </p>
        </div>
      </main>
    </>
  );
}
