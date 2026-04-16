/**
 * /new — first-time maker hero surface.
 *
 * Week 2 deliverable from spec v6 §1.
 *
 * Flow (current implementation — stubs for services not yet built):
 *   1. Maker must be signed in
 *   2. Choose source: GitHub repo URL OR paste framework details manually
 *   3. Name + slug + type (auto-suggested from detection)
 *   4. Preview card showing detection result + Quick Ship defaults
 *   5. "Ship it" → placeholder action for now (real deploy pipeline in Week 3)
 *
 * The `detectFramework` call runs server-side against a stubbed file list.
 * Week 6 wires real GitHub repo inspection via the GitHub App.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { detectFramework } from '@/lib/detect/framework';
import { PROJECT_TYPES } from '@shippie/shared';
import { UploadForm } from './upload-form';

interface SearchParams {
  source?: string;
  name?: string;
  framework?: string;
  type?: string;
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
  const detected =
    params.source === 'github'
      ? await detectFromStub(params.name ?? 'recipes')
      : null;

  async function shipIt(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '');
    const slug = String(formData.get('slug') ?? '');
    const type = String(formData.get('type') ?? 'app');
    // TODO(week 3): kick off the real deploy pipeline with detected framework,
    // preflight, build in Vercel Sandbox, upload to R2, publish via KV pointer.
    console.log('[shippie:new]', { name, slug, type });
    redirect(`/new?source=github&name=${encodeURIComponent(slug || name)}`);
  }

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
            <Link href="/" className="hover:underline">shippie.app</Link> · new
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Ship your app
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">
            Connect a GitHub repo or upload files. Shippie detects the
            framework, packages everything, and puts your app live at{' '}
            <code className="font-mono text-sm text-neutral-500">
              {'<slug>'}.shippie.app
            </code>{' '}
            — installable on your phone in three taps.
          </p>
        </header>

        <section className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-3">
          <p className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
            What are you shipping?
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="font-semibold">app</dt>
              <dd className="text-neutral-600 dark:text-neutral-400 mt-1">
                Phone-first. Installable. Works offline. No review queue.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">web_app</dt>
              <dd className="text-neutral-600 dark:text-neutral-400 mt-1">
                Real tools on the web. Tabs, URLs, desktop-friendly.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">website</dt>
              <dd className="text-neutral-600 dark:text-neutral-400 mt-1">
                Static sites with marketplace, feedback, and analytics built in.
              </dd>
            </div>
          </dl>
          <p className="text-xs text-neutral-500 font-mono">
            We auto-detect from your source, but you can override below.
          </p>
        </section>

        <section className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-4">
          <h2 className="font-semibold text-lg">1 · Pick a source</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link
              href="/new?source=github&name=recipes"
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-brand-500 transition-colors"
            >
              <p className="font-semibold">GitHub repo</p>
              <p className="text-sm text-neutral-500 mt-1">
                Connect the Shippie GitHub App to any repo you own. Auto-redeploys on push.
              </p>
              <p className="text-xs text-neutral-500 mt-3 font-mono">week 6</p>
            </Link>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="font-semibold">Upload zip</p>
              <p className="text-sm text-neutral-500 mt-1">
                Drop a zip of your built output. Shippie runs preflight, injects PWA
                assets, and serves it at <code>{'<slug>'}.shippie.app</code>.
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-mono">
                live · use the form below
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-6 space-y-4">
          <h2 className="font-semibold text-lg">2 · Upload your zip</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Works with any static site: a built SPA, a static HTML folder,
            a Vite/Astro/Next-static <code>dist/</code>. Must contain{' '}
            <code>index.html</code> at the root (except type=website).
          </p>
          <UploadForm />
        </section>

        {detected && (
          <section className="rounded-xl border border-brand-500/30 bg-brand-50/40 dark:bg-brand-900/10 p-6 space-y-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
                Detection preview
              </p>
              <h2 className="font-semibold text-xl">
                We think this is a <strong>{detected.framework}</strong> project
                {detected.suggestedType !== 'website' && (
                  <> — type <strong>{detected.suggestedType}</strong></>
                )}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Confidence: {Math.round(detected.confidence * 100)}%
                {detected.packageManager && (
                  <> · using <code className="font-mono">{detected.packageManager}</code></>
                )}
              </p>
            </div>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  Install
                </dt>
                <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                  {detected.installCommand ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  Build
                </dt>
                <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                  {detected.buildCommand ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  Output
                </dt>
                <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                  {detected.outputDir ?? 'dist'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  PWA runtime
                </dt>
                <dd className="font-mono text-neutral-700 dark:text-neutral-300">
                  auto-injected
                </dd>
              </div>
            </dl>

            {detected.notes && detected.notes.length > 0 && (
              <ul className="text-sm text-neutral-600 dark:text-neutral-400 list-disc pl-5 space-y-1">
                {detected.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            <form action={shipIt} className="space-y-4 pt-2">
              <h3 className="font-semibold">2 · Confirm details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                    Name
                  </span>
                  <input
                    name="name"
                    defaultValue={params.name ?? 'Recipes'}
                    required
                    className="mt-1 block w-full h-11 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm focus:border-brand-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                    Slug
                  </span>
                  <div className="flex items-center mt-1">
                    <input
                      name="slug"
                      defaultValue={params.name ?? 'recipes'}
                      pattern="[a-z0-9][a-z0-9\-]*"
                      required
                      className="flex-1 block h-11 rounded-l-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm focus:border-brand-500 outline-none"
                    />
                    <span className="inline-flex h-11 items-center px-3 rounded-r-md border border-l-0 border-neutral-300 dark:border-neutral-700 text-neutral-500 font-mono text-sm">
                      .shippie.app
                    </span>
                  </div>
                </label>
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  Project type
                </span>
                <select
                  name="type"
                  defaultValue={detected.suggestedType}
                  className="mt-1 block w-full h-11 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 font-mono text-sm focus:border-brand-500 outline-none"
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="inline-flex h-12 items-center rounded-full bg-brand-500 px-8 text-white font-medium hover:bg-brand-600 transition-colors"
              >
                Ship it →
              </button>
              <p className="text-xs text-neutral-500 font-mono">
                Week 3 wires the real deploy pipeline. For now this logs and reloads.
              </p>
            </form>
          </section>
        )}

        <section className="text-sm text-neutral-500 space-y-2 pt-4">
          <p>Signed in as {session.user.email}</p>
          <p className="font-mono text-xs">
            /new — Week 2 of the v6 build plan
          </p>
        </section>
      </div>
    </main>
  );
}

async function detectFromStub(repoName: string) {
  // Stub: pretend we cloned a Vite React repo
  // Week 6 replaces this with real GitHub App repo inspection
  return detectFramework({
    files: [
      'package.json',
      'vite.config.ts',
      'bun.lockb',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'tsconfig.json',
      'public/icon.png',
    ],
    packageJson: {
      name: repoName,
      scripts: { build: 'vite build', dev: 'vite' },
      devDependencies: {
        vite: '^5.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
    },
  });
}
