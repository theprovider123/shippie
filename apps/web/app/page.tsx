/**
 * Marketing landing page placeholder. Replaced in Week 14 with the
 * launch landing copy + value prop demo.
 */
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl space-y-8 text-center">
        <p className="text-sm uppercase tracking-widest text-brand-500 font-mono">
          shippie.app
        </p>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          Apps on your phone,
          <br />
          without the App Store.
        </h1>
        <p className="text-lg md:text-xl text-neutral-600 dark:text-neutral-400">
          Connect a repo or upload files. Live in seconds. Installed on a phone in
          three taps. Real users, real feedback, real iteration.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <Link
            href="/new"
            className="inline-flex h-12 items-center rounded-full bg-brand-500 px-8 text-white font-medium hover:bg-brand-600 transition-colors"
          >
            Ship your app
          </Link>
          <Link
            href="/storefront"
            className="inline-flex h-12 items-center rounded-full border border-neutral-300 dark:border-neutral-700 px-8 font-medium hover:border-neutral-400 transition-colors"
          >
            Browse apps
          </Link>
        </div>
        <p className="text-xs text-neutral-500 pt-12 font-mono">
          Ship to Web · Ship to Phone · Ship to Stores
        </p>
      </div>
    </main>
  );
}
