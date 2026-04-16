/**
 * /admin — app list with moderation controls.
 *
 * Lists ALL apps (not filtered by maker). Archive/restore buttons
 * call PATCH /api/admin/apps/[id].
 */
import { desc, sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { AdminAppRow } from './admin-app-row';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const db = await getDb();

  let apps;
  if (q) {
    apps = await db.execute(sql`
      select id, slug, name, type, visibility_scope as "visibilityScope",
             is_archived as "isArchived", takedown_reason as "takedownReason",
             last_deployed_at as "lastDeployedAt"
      from apps
      where name ilike ${'%' + q + '%'} or slug ilike ${'%' + q + '%'}
      order by updated_at desc
      limit 100
    `);
  } else {
    apps = await db.execute(sql`
      select id, slug, name, type, visibility_scope as "visibilityScope",
             is_archived as "isArchived", takedown_reason as "takedownReason",
             last_deployed_at as "lastDeployedAt"
      from apps
      order by updated_at desc
      limit 100
    `);
  }

  return (
    <main className="px-6 py-8 max-w-5xl mx-auto">
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-bold">All Apps</h1>
        <form className="flex gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or slug…"
            className="h-10 px-3 border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono text-sm flex-1"
          />
          <button type="submit" className="h-10 px-4 bg-neutral-900 text-white dark:bg-white dark:text-black text-sm">
            Search
          </button>
        </form>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-widest text-neutral-500">
            <th className="pb-2">Slug</th>
            <th className="pb-2">Name</th>
            <th className="pb-2">Type</th>
            <th className="pb-2">Visibility</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {(apps as unknown as Array<{
            id: string; slug: string; name: string; type: string;
            visibilityScope: string; isArchived: boolean; takedownReason: string | null;
          }>).map((app) => (
            <AdminAppRow key={app.id} app={app} />
          ))}
        </tbody>
      </table>
    </main>
  );
}
