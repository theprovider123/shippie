/**
 * /auth/signin — dev sign-in page.
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
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <Link
            href="/"
            className="text-sm uppercase tracking-widest text-brand-500 font-mono"
          >
            ← shippie.app
          </Link>
          <h1 className="text-3xl font-bold">Sign in to Shippie</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            We&apos;ll send you a magic link. No password.
          </p>
        </div>

        <form action={sendMagicLink} className="space-y-4">
          <label className="block">
            <span className="sr-only">Email address</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              placeholder="you@example.com"
              className="w-full h-12 rounded-full border border-neutral-300 dark:border-neutral-700 bg-transparent px-5 outline-none focus:border-brand-500 transition-colors"
            />
          </label>
          <button
            type="submit"
            className="w-full h-12 rounded-full bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors"
          >
            Send magic link
          </button>
        </form>

        {isDev && adminEmail && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex-1 border-t border-neutral-300 dark:border-neutral-700" />
              <span className="text-xs text-neutral-500 font-mono">or</span>
              <span className="flex-1 border-t border-neutral-300 dark:border-neutral-700" />
            </div>
            <a
              href={`/api/auth/dev-signin${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`}
              className="block w-full h-12 rounded-full border border-neutral-400 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 font-medium hover:border-brand-500 hover:text-brand-500 transition-colors flex items-center justify-center"
            >
              Dev: sign in as {adminEmail}
            </a>
            <p className="text-xs text-center text-neutral-500 font-mono">
              one-click · only available when NODE_ENV !== production
            </p>
          </div>
        )}

        <p className="text-xs text-center text-neutral-500 font-mono">
          dev mode · link prints to your terminal
        </p>
      </div>
    </main>
  );
}
