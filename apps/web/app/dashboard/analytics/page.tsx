/**
 * /dashboard/analytics — per-app event counts for the signed-in maker.
 *
 * Shows, for each app the maker owns:
 *   - total events in the last 7 days
 *   - unique users
 *   - top 5 event names with counts
 *   - anonymous vs identified split
 *
 * All aggregation runs in Postgres. Real time-series charts (hourly
 * buckets, bar rendering) land in Week 12.
 *
 * Spec v6 §10.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AppAnalytics {
  app_id: string;
  slug: string;
  name: string;
  total: number;
  unique_users: number;
  anon: number;
  top_events: Array<{ event_name: string; count: number }>;
}

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/signin?return_to=/dashboard/analytics');

  const db = await getDb();

  const rows = await db.execute(sql`
    with my_apps as (
      select id, slug, name from apps where maker_id = ${session.user.id}
    ),
    recent as (
      select e.app_id, e.user_id, e.event_name
      from analytics_events e
      where e.app_id in (select id from my_apps)
        and e.created_at > now() - interval '7 days'
    ),
    per_event as (
      select app_id, event_name, count(*)::int as count
      from recent
      group by app_id, event_name
    ),
    top_events as (
      select app_id, jsonb_agg(jsonb_build_object('event_name', event_name, 'count', count) order by count desc) filter (where rn <= 5) as top
      from (
        select app_id, event_name, count, row_number() over (partition by app_id order by count desc) as rn
        from per_event
      ) t
      group by app_id
    )
    select
      a.id as app_id,
      a.slug,
      a.name,
      coalesce((select count(*)::int from recent r where r.app_id = a.id), 0) as total,
      coalesce((select count(distinct r.user_id)::int from recent r where r.app_id = a.id and r.user_id is not null), 0) as unique_users,
      coalesce((select count(*)::int from recent r where r.app_id = a.id and r.user_id is null), 0) as anon,
      coalesce(te.top, '[]'::jsonb) as top_events
    from my_apps a
    left join top_events te on te.app_id = a.id
    order by total desc
  `);

  const apps = rows as unknown as AppAnalytics[];

  return (
    <main className="min-h-screen px-6 py-16 max-w-4xl mx-auto">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">Last 7 days across your apps.</p>
      </header>

      {apps.length === 0 ? (
        <p className="text-neutral-500">No apps or no events yet.</p>
      ) : (
        <ul className="space-y-4">
          {apps.map((a) => (
            <li key={a.app_id} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
              <div className="flex items-center justify-between gap-4">
                <Link href={`/apps/${a.slug}`} className="font-semibold text-lg hover:underline">
                  {a.name}
                </Link>
                <div className="flex gap-4 text-sm text-neutral-500 font-mono">
                  <span>{a.total} events</span>
                  <span>{a.unique_users} users</span>
                  <span>{a.anon} anon</span>
                </div>
              </div>
              {a.top_events.length > 0 && (
                <ul className="mt-3 text-xs font-mono text-neutral-600 dark:text-neutral-400">
                  {a.top_events.map((e) => (
                    <li key={e.event_name} className="flex items-center gap-3">
                      <span className="w-40 truncate">{e.event_name}</span>
                      <span className="flex-1">
                        <span
                          className="inline-block h-2 rounded-full bg-brand-500/30"
                          style={{ width: `${Math.min(100, (e.count / Math.max(1, a.total)) * 100)}%` }}
                        />
                      </span>
                      <span>{e.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
