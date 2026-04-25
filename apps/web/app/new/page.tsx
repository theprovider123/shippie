/**
 * /new — ship a new app.
 *
 * Three entry points, one page:
 *   1. Upload a built zip (live now, most common)
 *   2. Wrap a hosted URL (live now — SSR-friendly)
 *   3. Connect a GitHub repo (GitHub App flow)
 *
 * If the user came back from the GitHub App install, `installation_id` is
 * set and we show the repo picker inline.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { UploadForm } from './upload-form';
import { RepoPicker } from './repo-picker';
import { WrapForm } from './wrap-form';

interface SearchParams {
  installation_id?: string;
  setup_action?: string;
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?return_to=/new');
  }

  const params = await searchParams;
  const justInstalledGithub = Boolean(params.installation_id);

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Ship your app
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">
            Three ways to get live at{' '}
            <code className="font-mono text-sm text-neutral-500">
              {'<slug>'}.shippie.app
            </code>
            . Pick one.
          </p>
        </header>

        {justInstalledGithub ? (
          <section className="rounded-xl border border-brand-500/30 bg-brand-50/40 dark:bg-brand-900/10 p-6 space-y-4">
            <h2 className="font-semibold text-lg">Pick a repo</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Shippie has access to the repos you selected on GitHub. Pick one to ship.
            </p>
            <RepoPicker installationId={params.installation_id!} />
          </section>
        ) : (
          <section className="space-y-6">
            <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
              <h2 className="font-semibold text-lg">Upload a zip</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Drop a zip of your built output — any static site, SPA, or
                framework <code>dist/</code>. Must have <code>index.html</code>{' '}
                at the root.
              </p>
              <UploadForm />
            </div>

            <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
              <h2 className="font-semibold text-lg">Wrap a hosted URL</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Already on Vercel, Netlify, or your own server? Keep it there.
                Shippie serves it at{' '}
                <code className="font-mono">{'{slug}'}.shippie.app</code> with
                PWA install, marketplace, and ratings on top.
              </p>
              <WrapForm />
            </div>

            <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
              <h2 className="font-semibold text-lg">Connect a GitHub repo</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Install the Shippie GitHub App, pick a repo, auto-redeploy on push.
              </p>
              <a
                href="/api/github/install"
                className="inline-flex h-11 items-center rounded-full border border-neutral-300 dark:border-neutral-700 px-5 text-sm font-medium hover:border-brand-500 transition-colors"
              >
                Install GitHub App →
              </a>
            </div>
          </section>
        )}

        <p className="text-sm text-neutral-500">
          Signed in as {session.user.email}
        </p>
      </div>
    </main>
  );
}
