/**
 * /admin/audit — audit log viewer with pagination.
 */
import { desc, sql } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string; action?: string }>;
}) {
  const { offset: offsetStr, action } = await searchParams;
  const offset = parseInt(offsetStr ?? '0', 10) || 0;
  const limit = 50;

  const db = await getDb();

  const rows = await db.execute(sql`
    select
      al.id,
      al.action,
      al.target_type as "targetType",
      al.target_id as "targetId",
      al.metadata,
      al.created_at as "createdAt",
      u.email as "actorEmail"
    from audit_log al
    left join users u on u.id = al.actor_user_id
    ${action ? sql`where al.action = ${action}` : sql``}
    order by al.created_at desc
    limit ${limit}
    offset ${offset}
  `);

  const entries = rows as unknown as Array<{
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    actorEmail: string | null;
  }>;

  return (
    <main className="px-6 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Showing {entries.length} entries (offset {offset}).
          {action && ` Filtered: ${action}`}
        </p>
      </header>

      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-widest text-neutral-500">
            <th className="pb-2">Time</th>
            <th className="pb-2">Actor</th>
            <th className="pb-2">Action</th>
            <th className="pb-2">Target</th>
            <th className="pb-2">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 text-xs text-neutral-500 whitespace-nowrap">
                {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
              </td>
              <td className="py-2 text-xs">{e.actorEmail ?? '—'}</td>
              <td className="py-2">{e.action}</td>
              <td className="py-2 text-xs">
                {e.targetType && <span>{e.targetType}:{e.targetId?.slice(0, 8)}</span>}
              </td>
              <td className="py-2 text-xs text-neutral-500 max-w-xs truncate">
                {e.metadata ? JSON.stringify(e.metadata).slice(0, 80) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-4 mt-6 text-sm">
        {offset > 0 && (
          <a href={`/admin/audit?offset=${Math.max(0, offset - limit)}${action ? `&action=${action}` : ''}`} className="underline">
            ← Previous
          </a>
        )}
        {entries.length === limit && (
          <a href={`/admin/audit?offset=${offset + limit}${action ? `&action=${action}` : ''}`} className="underline">
            Next →
          </a>
        )}
      </div>
    </main>
  );
}
