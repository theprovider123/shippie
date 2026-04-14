/**
 * /auth/verify-request — shown after a magic link is sent.
 *
 * In dev, the magic link prints to the terminal running `next dev`.
 * In production (Week 11+), it goes to the user's email via Resend.
 */
export default function VerifyRequestPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-bold">Check your email</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          We sent a magic link. Click it to finish signing in.
        </p>
        <div className="rounded-lg border border-brand-500/30 bg-brand-50 dark:bg-brand-900/20 p-4 text-left text-sm font-mono">
          <p className="font-semibold text-brand-700 dark:text-brand-100">dev mode</p>
          <p className="text-brand-900 dark:text-brand-50 mt-1">
            The link is in the terminal running <code>bun run dev</code>.
            Paste it into your browser.
          </p>
        </div>
      </div>
    </main>
  );
}
