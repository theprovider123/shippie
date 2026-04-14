/**
 * /dashboard — protected maker dashboard placeholder.
 *
 * Week 4 will replace this with the real dashboard (My Apps, Feedback,
 * Deploys, Settings). For now it's a sign-in sanity check: if you land
 * here with a valid session, auth works end to end.
 */
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin');
  }

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
            Dashboard
          </p>
          <h1 className="text-3xl font-bold">
            Welcome{session.user.name ? `, ${session.user.name}` : ''}.
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Signed in as <strong>{session.user.email}</strong>
          </p>
        </header>

        <section className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
          <h2 className="font-semibold">Auth sanity check</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            You reached this page with a valid database session. The
            Drizzle adapter, PGlite backend, and Nodemailer dev provider
            all work end-to-end.
          </p>
          <pre className="text-xs font-mono bg-neutral-100 dark:bg-neutral-900 p-3 rounded overflow-auto">
{JSON.stringify(
  {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  },
  null,
  2,
)}
          </pre>
        </section>

        <form action={handleSignOut}>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full border border-neutral-300 dark:border-neutral-700 px-5 text-sm font-medium hover:border-neutral-400 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
