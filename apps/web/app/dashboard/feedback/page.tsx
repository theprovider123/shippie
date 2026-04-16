/**
 * /dashboard/feedback — maker inbox for all apps they own.
 *
 * Lists feedback_items across the maker's apps, sorted by most-voted
 * then most-recent. Status filter via ?status=open|resolved|... .
 *
 * Spec v6 §10 (unified feedback inbox).
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
  duplicate: 'Duplicate',
} as const;

export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?return_to=/dashboard/feedback');

  const { status } = await searchParams;
  const db = await getDb();

  const myApps = await db.query.apps.findMany({
    where: eq(schema.apps.makerId, session.user.id),
  });
  const appIds = myApps.map((a: { id: string }) => a.id);

  if (appIds.length === 0) {
    return (
      <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold">Feedback</h1>
        <p className="mt-6 text-neutral-500">You haven&apos;t shipped any apps yet.</p>
      </main>
    );
  }

  const items = await db.query.feedbackItems.findMany({
    where: status
      ? and(
          inArray(schema.feedbackItems.appId, appIds),
          eq(schema.feedbackItems.status, status),
        )
      : inArray(schema.feedbackItems.appId, appIds),
    orderBy: [desc(schema.feedbackItems.voteCount), desc(schema.feedbackItems.createdAt)],
    limit: 100,
  });

  const appNameById = new Map(myApps.map((a: { id: string; name: string; slug: string }) => [a.id, a]));

  return (
    <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Feedback</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          {items.length} {items.length === 1 ? 'item' : 'items'} across {myApps.length} app
          {myApps.length === 1 ? '' : 's'}.
        </p>
        <nav className="mt-4 flex gap-3 text-sm">
          <FilterLink current={status} value="">All</FilterLink>
          <FilterLink current={status} value="open">Open</FilterLink>
          <FilterLink current={status} value="acknowledged">Acknowledged</FilterLink>
          <FilterLink current={status} value="resolved">Resolved</FilterLink>
        </nav>
      </header>

      {items.length === 0 ? (
        <p className="text-neutral-500">No feedback yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item: typeof items[number]) => {
            const app = appNameById.get(item.appId) as { name: string; slug: string } | undefined;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-500">
                      <span>{item.type}</span>
                      <span>·</span>
                      <span>{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}</span>
                      {item.rating != null && (
                        <>
                          <span>·</span>
                          <span>{'★'.repeat(item.rating)}</span>
                        </>
                      )}
                      <span>·</span>
                      <Link href={`/apps/${app?.slug}`} className="hover:underline">
                        {app?.name}
                      </Link>
                    </div>
                    {item.title && <h2 className="mt-1 font-semibold">{item.title}</h2>}
                    {item.body && (
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {item.body}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-sm font-mono text-neutral-500">
                    {item.voteCount >= 0 ? '+' : ''}
                    {item.voteCount}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function FilterLink({
  current,
  value,
  children,
}: {
  current?: string;
  value: string;
  children: React.ReactNode;
}) {
  const active = (current ?? '') === value;
  const href = value ? `/dashboard/feedback?status=${value}` : '/dashboard/feedback';
  return (
    <Link
      href={href as `/${string}`}
      className={
        active
          ? 'text-brand-500 font-medium'
          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
      }
    >
      {children}
    </Link>
  );
}
