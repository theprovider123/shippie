/**
 * /dashboard — maker home.
 *
 * Lists quick actions (Ship new app, View your apps) and links to the
 * real feature surfaces. Week 4+ fills this out with feedback inbox,
 * deploys log, analytics tiles.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      <div className="max-w-4xl mx-auto space-y-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
            Dashboard
          </p>
          <h1 className="text-4xl font-bold">
            Welcome{session.user.name ? `, ${session.user.name}` : ''}.
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Signed in as <strong>{session.user.email}</strong>
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/new"
            className="rounded-xl border border-brand-500/40 bg-brand-50/40 dark:bg-brand-900/10 p-6 hover:border-brand-500 transition-colors"
          >
            <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
              Action
            </p>
            <h2 className="text-xl font-semibold mt-1">Ship a new app</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
              Upload a zip or connect a GitHub repo. Live in under a minute.
            </p>
          </Link>

          <Link
            href="/dashboard/apps"
            className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 hover:border-neutral-400 transition-colors"
          >
            <p className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
              Your stuff
            </p>
            <h2 className="text-xl font-semibold mt-1">Your apps</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
              All apps you've shipped, with status, versions, and live URLs.
            </p>
          </Link>
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
