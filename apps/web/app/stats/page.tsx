/**
 * /stats — public deploy-time dashboard.
 *
 * Counterculture-honest: we claim 60 seconds, we show the data.
 *
 * Pulls rolling p50/p95 deploy duration per source_type from the deploys table.
 * Doubles as a forcing function for the C1/C2/C3 engineering targets.
 *
 * See differentiation plan Pillar C5.
 */
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { RocketMark } from '../components/rocket-mark';
import { ThemeToggle } from '../theme-toggle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5-minute revalidate; still public

export const metadata = {
  title: 'Stats — deploy times, live',
  description: 'Rolling p50/p95 deploy times per path. Honesty is the marketing.',
};

interface Row {
  sourceType: string;
  count: number;
  p50: number;
  p95: number;
  failureRate: number;
}

const TARGETS: Record<string, { p50: number; p95: number }> = {
  zip:    { p50: 30_000,  p95: 60_000 },
  github: { p50: 60_000,  p95: 120_000 },
  mcp:    { p50: 60_000,  p95: 90_000 },
};

async function loadStats(windowDays: number): Promise<Row[]> {
  const db = await getDb();
  const rows = (await db.execute(sql`
    select source_type as "sourceType",
           count(*)::int as count,
           coalesce(
             percentile_cont(0.5) within group (order by duration_ms)
             filter (where status = 'success' and duration_ms is not null),
             0
           )::int as p50,
           coalesce(
             percentile_cont(0.95) within group (order by duration_ms)
             filter (where status = 'success' and duration_ms is not null),
             0
           )::int as p95,
           coalesce(
             avg(case when status = 'failed' then 1.0 else 0.0 end),
             0
           )::float as "failureRate"
    from deploys
    where created_at > now() - (${windowDays}::text || ' days')::interval
    group by source_type
    order by count desc
  `)) as unknown as Row[];
  return rows;
}

export default async function StatsPage() {
  const rows = await loadStats(30);
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="grain">
      <nav className="navbar">
        <div className="nav-bar-inner">
          <div className="nav-group-left">
            <Link href="/" className="nav-logo">
              <RocketMark size={22} />
              <span className="nav-wordmark">shippie</span>
            </Link>
          </div>
          <div className="nav-group-center">
            <Link href="/apps" className="nav-link nav-desktop">Explore</Link>
            <Link href="/why" className="nav-link nav-desktop">Why</Link>
            <Link href="/docs" className="nav-link nav-desktop">Docs</Link>
          </div>
          <div className="nav-group-right">
            <ThemeToggle />
            <Link href="/new" className="btn-primary nav-cta">Deploy an app</Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="section--lg">
          <div className="wrap" style={{ maxWidth: 960 }}>
            <p className="section-label">Proof of speed</p>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--h1-size)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                marginBottom: 'var(--space-xl)',
              }}
            >
              Deploy times, live.
            </h1>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 640 }}>
              Rolling 30-day p50 and p95 of successful deploys, grouped by path. If the green targets fail, our own charts show it first.
              {total === 0 && (
                <>
                  {' '}<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-light)' }}>
                    (No deploys yet — this page starts reporting as soon as the first deploys roll in.)
                  </span>
                </>
              )}
            </p>
          </div>
        </section>

        <section className="section" style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="wrap">
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--small-size)',
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <Th>Path</Th>
                    <Th>Deploys (30d)</Th>
                    <Th>p50</Th>
                    <Th>Target p50</Th>
                    <Th>p95</Th>
                    <Th>Target p95</Th>
                    <Th>Failure rate</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <Td colSpan={7} muted>
                        Deploying your first app? Watch this space — it fills in automatically.
                      </Td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const target = TARGETS[row.sourceType] ?? { p50: 60_000, p95: 120_000 };
                      return (
                        <tr key={row.sourceType} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <Td label>{row.sourceType}</Td>
                          <Td>{row.count.toLocaleString()}</Td>
                          <Td highlight={row.p50 <= target.p50}>{formatMs(row.p50)}</Td>
                          <Td muted>≤ {formatMs(target.p50)}</Td>
                          <Td highlight={row.p95 <= target.p95}>{formatMs(row.p95)}</Td>
                          <Td muted>≤ {formatMs(target.p95)}</Td>
                          <Td>{(row.failureRate * 100).toFixed(1)}%</Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--caption-size)',
                color: 'var(--text-light)',
                marginTop: 'var(--space-lg)',
                lineHeight: 1.7,
              }}
            >
              Times are <em>time-to-serve</em> — first byte to last byte of the deploy pipeline.
              Time-to-URL will publish separately once the hot/cold path split ships.
              Cache refreshes every 5 minutes. Data source: <code>deploys.duration_ms</code>.
            </p>
          </div>
        </section>

        <section
          className="section"
          style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-pure)' }}
        >
          <div className="wrap" style={{ maxWidth: 760 }}>
            <h2 className="section-heading" style={{ fontSize: 'var(--h2-size)' }}>
              What the targets mean.
            </h2>
            <ul
              style={{
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                paddingLeft: 'var(--space-lg)',
                marginTop: 'var(--space-xl)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
              }}
            >
              <li><strong>zip</strong> — drag-drop + CLI uploads. Target: p50 ≤30s, p95 ≤60s.</li>
              <li><strong>github</strong> — repo push + webhook rebuild. Target: p50 ≤60s, p95 ≤120s on warm cache.</li>
              <li><strong>mcp</strong> — Claude Code / Cursor via the MCP server. Target: p50 ≤60s, p95 ≤90s.</li>
            </ul>
            <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-lg)', lineHeight: 1.7 }}>
              If a p95 creeps past its target, the corresponding engineering ticket moves up on the roadmap. That&apos;s the whole point of publishing this.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: 'var(--space-md)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--caption-size)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-light)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  label,
  highlight,
  muted,
  colSpan,
}: {
  children: React.ReactNode;
  label?: boolean;
  highlight?: boolean;
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: 'var(--space-md)',
        fontFamily: label ? 'var(--font-body)' : 'var(--font-mono)',
        fontSize: 'var(--small-size)',
        fontWeight: label ? 600 : 400,
        color: highlight ? 'var(--sage-leaf)' : muted ? 'var(--text-light)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </td>
  );
}

function formatMs(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
