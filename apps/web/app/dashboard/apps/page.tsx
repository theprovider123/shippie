/**
 * /dashboard/apps — maker's app list.
 *
 * Server component. Queries apps + latest deploy per app, renders a
 * table with slug, name, type, active version, deploy status, last
 * deployed timestamp, and a "Open" link to the live URL.
 *
 * Spec v6 §19 (project structure), Week 4 dashboard target.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { schema } from '@shippie/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DashboardAppsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/signin?return_to=/dashboard/apps');
  }

  const db = await getDb();
  const rows = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      type: schema.apps.type,
      tagline: schema.apps.tagline,
      themeColor: schema.apps.themeColor,
      latestDeployStatus: schema.apps.latestDeployStatus,
      activeDeployId: schema.apps.activeDeployId,
      lastDeployedAt: schema.apps.lastDeployedAt,
      createdAt: schema.apps.createdAt,
    })
    .from(schema.apps)
    .where(eq(schema.apps.makerId, session.user.id))
    .orderBy(desc(schema.apps.updatedAt));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>{' '}
              · apps
            </p>
            <h1 className="text-4xl font-bold tracking-tight">Your apps</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              {rows.length === 0
                ? "You haven't shipped anything yet."
                : `${rows.length} app${rows.length === 1 ? '' : 's'} · signed in as ${session.user.email}`}
            </p>
          </div>
          <Link
            href="/new"
            className="inline-flex h-11 items-center rounded-full bg-brand-500 px-6 text-white font-medium hover:bg-brand-600 transition-colors whitespace-nowrap"
          >
            Ship new app →
          </Link>
        </header>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-900">
                <tr>
                  <Th>App</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Last deploy</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => (
                  <tr
                    key={app.id}
                    className="border-t border-neutral-200 dark:border-neutral-800"
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-block w-8 h-8 rounded-lg"
                          style={{ background: app.themeColor }}
                          aria-hidden
                        />
                        <div>
                          <div className="font-semibold">{app.name}</div>
                          <div className="text-xs font-mono text-neutral-500">
                            {app.slug}.shippie.app
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <TypeBadge type={app.type} />
                    </Td>
                    <Td>
                      <StatusBadge status={app.latestDeployStatus} />
                    </Td>
                    <Td className="text-neutral-500 font-mono text-xs">
                      {app.lastDeployedAt
                        ? formatRelative(new Date(app.lastDeployedAt))
                        : 'never'}
                    </Td>
                    <Td className="text-right">
                      <a
                        href={devUrl(app.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-500 hover:underline font-medium"
                      >
                        Open →
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-16 text-center space-y-6">
      <p className="text-6xl" aria-hidden>
        🍳
      </p>
      <h2 className="text-2xl font-bold">Ship your first app</h2>
      <p className="max-w-md mx-auto text-neutral-600 dark:text-neutral-400">
        Upload a static zip or connect a GitHub repo and your app is live at{' '}
        <code className="font-mono text-sm">{'<slug>'}.shippie.app</code> in under a
        minute.
      </p>
      <Link
        href="/new"
        className="inline-flex h-12 items-center rounded-full bg-brand-500 px-8 text-white font-medium hover:bg-brand-600 transition-colors"
      >
        Get started
      </Link>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = type === 'app' ? 'App' : type === 'web_app' ? 'Web App' : 'Site';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const palette: Record<string, string> = {
    success:
      'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200',
    building:
      'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200',
    needs_secrets:
      'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-200',
    failed: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200',
  };
  const key = status ?? 'none';
  const className = palette[key] ?? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono ${className}`}
    >
      {status ?? 'draft'}
    </span>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left text-xs font-mono uppercase tracking-widest text-neutral-500 font-semibold px-4 py-3 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function devUrl(slug: string): string {
  // Dev: open against the local worker on port 4200. Prod points at
  // https://{slug}.shippie.app directly.
  if (process.env.NODE_ENV === 'production') {
    return `https://${slug}.shippie.app/`;
  }
  const port = process.env.SHIPPIE_WORKER_PORT ?? '4200';
  return `http://${slug}.localhost:${port}/`;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
