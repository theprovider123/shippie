/**
 * /deploy?repo=<github-url>
 *
 * Deploy-from-URL page. Used by the "Deploy to Shippie" README badge.
 * Clones the repo, builds, and deploys.
 *
 * Spec v5 §4 (deploy button).
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DeployPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const { repo } = await searchParams;
  const session = await auth();

  if (!session?.user?.id) {
    const returnTo = repo ? `/deploy?repo=${encodeURIComponent(repo)}` : '/deploy';
    redirect(`/auth/signin?return_to=${encodeURIComponent(returnTo)}`);
  }

  if (!repo) {
    // /deploy with no ?repo= param is only reached if someone lands here directly.
    // The README "Deploy to Shippie" badge always sends ?repo=. Send bare hits to /new.
    redirect('/new');
  }

  // Extract slug from repo URL
  const repoName = repo.split('/').pop()?.replace('.git', '') ?? 'app';
  const slug = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-bold">Deploy {repoName}</h1>
        <p className="text-sm font-mono text-neutral-500">{repo}</p>
        <p className="text-neutral-600 dark:text-neutral-400">
          This will clone the repo, detect the framework, build, and deploy to{' '}
          <strong>{slug}.shippie.app</strong>.
        </p>
        <form action="/api/deploy/github" method="POST">
          <input type="hidden" name="repo_url" value={repo} />
          <input type="hidden" name="slug" value={slug} />
          <button
            type="submit"
            className="w-full h-14 bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors text-lg"
          >
            Ship it
          </button>
        </form>
        <p className="text-xs text-neutral-500">
          Signed in as {session.user.email}.{' '}
          <Link href="/auth/signin" className="underline">
            Switch account
          </Link>
        </p>
      </div>
    </main>
  );
}
