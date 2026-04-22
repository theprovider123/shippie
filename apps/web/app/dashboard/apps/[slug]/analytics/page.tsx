// apps/web/app/dashboard/apps/[slug]/analytics/page.tsx
/**
 * Maker-facing analytics for a Shippie-deployed app.
 *
 * Phase 3 v1: renders the last-30-day install funnel, installs-per-day
 * trend, and IAB bounce rate. Data source is `usage_daily` populated
 * by the hourly rollup cron (see `/api/internal/rollups`).
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  queryIabBounce,
  queryInstallFunnel,
  queryUsageDaily,
} from '@/lib/shippie/analytics-queries';
import { queryWebVitals } from '@/lib/shippie/vitals-queries';
import { FunnelBars, LineChart } from './charts';

function formatVital(name: 'LCP' | 'CLS' | 'INP', v: number): string {
  if (name === 'CLS') return v.toFixed(3);
  return `${Math.round(v)}ms`;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?return_to=/dashboard/apps/${slug}/analytics`);
  }

  const db = await getDb();
  const app = await db.query.apps.findFirst({
    where: and(eq(schema.apps.slug, slug), eq(schema.apps.makerId, session.user.id)),
  });
  if (!app) notFound();

  // The event spine stores `app_id` as the slug (see ingest-events +
  // rollups routes); keep the dashboard query identifier consistent.
  const [installsDaily, funnel, iab, vitals] = await Promise.all([
    queryUsageDaily(db, {
      appId: app.slug,
      eventType: 'install_prompt_accepted',
      days: 30,
    }),
    queryInstallFunnel(db, { appId: app.slug, days: 30 }),
    queryIabBounce(db, { appId: app.slug, days: 30 }),
    queryWebVitals(db, { appId: app.slug, days: 30 }),
  ]);

  const points = installsDaily.map((r) => ({
    label: r.day.toISOString().slice(5, 10),
    value: r.count,
  }));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-brand-500 font-mono">
            <Link href={`/dashboard/apps`} className="hover:underline">
              Apps
            </Link>{' '}
            · {slug} · analytics · last 30 days
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            {app.name}
          </h1>
        </header>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-3">
            Installs per day
          </h2>
          <LineChart points={points} label="Installs per day" />
        </section>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-3">
            Install funnel
          </h2>
          <FunnelBars
            steps={[
              { label: 'Prompt shown', value: funnel.shown },
              {
                label: 'Accepted',
                value: funnel.accepted,
                color: 'var(--sage-leaf, #7A9A6E)',
              },
              {
                label: 'Dismissed',
                value: funnel.dismissed,
                color: 'var(--text-light, #7A6B58)',
              },
            ]}
          />
          <p className="text-sm text-neutral-500 mt-3">
            Conversion: {(funnel.conversion * 100).toFixed(1)}%
          </p>
        </section>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-3">
            In-app browser bounces
          </h2>
          <FunnelBars
            steps={[
              { label: 'IAB detected', value: iab.detected },
              {
                label: 'Bounced to browser',
                value: iab.bounced,
                color: 'var(--sunset, #E8603C)',
              },
            ]}
          />
          <p className="text-sm text-neutral-500 mt-3">
            Bounce rate: {(iab.rate * 100).toFixed(1)}%
          </p>
        </section>

        <section>
          <h2 className="text-sm font-mono uppercase tracking-widest text-neutral-500 mb-3">
            Web vitals (p75)
          </h2>
          {vitals.length === 0 ? (
            <p className="text-sm text-neutral-500">No samples yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {vitals.map((v) => (
                <div
                  key={v.name}
                  className="rounded-lg bg-neutral-900/50 p-4 border border-neutral-800"
                >
                  <div className="text-xs font-mono uppercase tracking-widest text-neutral-500">
                    {v.name}
                  </div>
                  <div className="text-2xl font-semibold mt-1">
                    {formatVital(v.name, v.p75)}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    p50 {formatVital(v.name, v.p50)} · p95{' '}
                    {formatVital(v.name, v.p95)} · {v.samples.toLocaleString()}{' '}
                    samples
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
