/**
 * /apps — Marketplace storefront.
 *
 * Warm dark background. Square icons. Sunset only on active states.
 */
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { publicCapabilityBadges } from '@/lib/shippie/capability-badges';
import { readProvenCapabilitiesBatch } from '@/lib/shippie/capability-proofs';
import { SiteNav } from '../components/site-nav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AppRow {
  id: string; slug: string; name: string; tagline: string | null;
  description: string | null; type: string; category: string;
  themeColor: string; compatibilityScore: number; installCount: number;
  rankScore: number;
  autopackagingReport: unknown;
}

async function loadApps(query?: string): Promise<AppRow[]> {
  const db = await getDb();
  const q = (query ?? '').trim();
  if (!q) {
    return (await db.execute(sql`
      select apps.id, apps.slug, apps.name, apps.tagline, apps.description, apps.type, apps.category, apps.theme_color as "themeColor",
             compatibility_score as "compatibilityScore", install_count as "installCount",
             greatest(ranking_score_app, ranking_score_web_app, ranking_score_website) as "rankScore",
             deploys.autopackaging_report as "autopackagingReport"
      from apps left join deploys on deploys.id = apps.active_deploy_id
      where active_deploy_id is not null and is_archived = false
        and visibility_scope = 'public'
      order by "rankScore" desc nulls last, last_deployed_at desc nulls last limit 60
    `)) as unknown as AppRow[];
  }
  return (await db.execute(sql`
    select apps.id, apps.slug, apps.name, apps.tagline, apps.description, apps.type, apps.category, apps.theme_color as "themeColor",
           compatibility_score as "compatibilityScore", install_count as "installCount",
           (ts_rank(search_tsv, plainto_tsquery('simple', ${q})) * 2 + similarity(name, ${q}) + similarity(slug, ${q})) as "rankScore",
           deploys.autopackaging_report as "autopackagingReport"
    from apps left join deploys on deploys.id = apps.active_deploy_id
    where active_deploy_id is not null and is_archived = false
      and visibility_scope = 'public'
      and (search_tsv @@ plainto_tsquery('simple', ${q}) or name % ${q} or slug % ${q})
    order by "rankScore" desc limit 60
  `)) as unknown as AppRow[];
}

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const apps = await loadApps(q);
  const db = await getDb();
  const proofs = await readProvenCapabilitiesBatch(db, apps.map((a) => a.id));

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <SiteNav />

      <div
        className="max-w-6xl mx-auto px-6 pb-12"
        style={{ paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))' }}
      >
        <header className="space-y-3 mb-12">
          <h1 className="text-display text-4xl md:text-5xl">Apps on Shippie</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            No app store. Just the web, installed. Vibecoded apps, on your phone in 60 seconds.
          </p>
          <form className="mt-6">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search apps..."
              className="w-full max-w-md h-12 px-4 bg-transparent font-mono text-sm"
              style={{ border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </form>
        </header>

        {apps.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{q ? `No apps matched "${q}".` : 'No apps deployed yet.'}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((app) => (
              <li key={app.id}>
                <Link
                  href={`/apps/${app.slug}`}
                  className="block p-6 transition-colors"
                  style={{ border: '1px solid var(--border-default)' }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="shippie-icon flex-shrink-0"
                      style={{
                        width: 64,
                        height: 64,
                        background: app.themeColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#EDE4D3',
                        fontFamily: 'var(--font-heading)',
                        fontSize: 28,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '-0.02em',
                      }}
                      aria-hidden
                    >
                      {app.name?.trim()?.[0] ?? app.slug?.[0] ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-lg truncate">{app.name}</h2>
                      <p className="text-xs font-mono uppercase" style={{ letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                        {app.type} · {app.category}
                      </p>
                      <p className="mt-2 text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {app.tagline ?? app.description ?? `${app.name} on Shippie`}
                      </p>
                      {publicCapabilityBadges(app.autopackagingReport, proofs.get(app.id)).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {publicCapabilityBadges(app.autopackagingReport, proofs.get(app.id)).slice(0, 3).map((badge) => (
                            <span
                              key={badge.label}
                              className="text-[10px] font-mono uppercase px-2 py-1"
                              style={{
                                border: '1px solid var(--border-default)',
                                color: badge.status === 'pass' ? 'var(--semantic-success)' : 'var(--text-muted)',
                                letterSpacing: '0.08em',
                              }}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span>{'★'.repeat(app.compatibilityScore)}{'☆'.repeat(5 - app.compatibilityScore)}</span>
                        <span>·</span>
                        <span>{app.installCount} installs</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
