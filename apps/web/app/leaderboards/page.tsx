/**
 * /leaderboards — public marketplace shelves.
 *
 * Three shelves: trending this week (most install-accepts in 7d), new
 * this week (apps created in 14d), and top-rated (>= 3 ratings).
 * Queries live in `@/lib/shippie/leaderboards`; this page just fetches
 * in parallel and renders a card grid per shelf.
 */
import { getDb } from '@/lib/db';
import { queryTrending, queryNew, queryTopRated, type LeaderboardEntry } from '@/lib/shippie/leaderboards';
import { AppCard } from './app-card';
import { SiteNav } from '../components/site-nav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShelfKind = 'trending' | 'new' | 'rated';

export default async function LeaderboardsPage() {
  const db = await getDb();
  const [trending, recent, topRated] = await Promise.all([
    queryTrending(db, {}),
    queryNew(db, {}),
    queryTopRated(db, {}),
  ]);

  return (
    <>
      <SiteNav />
      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: 'var(--space-xl)',
          paddingTop: 'calc(var(--nav-height) + var(--safe-top) + var(--space-xl))',
        }}
      >
        <header style={{ marginBottom: 'var(--space-2xl)' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              textTransform: 'uppercase',
              color: 'var(--text-light)',
              letterSpacing: '0.12em',
              margin: 0,
            }}
          >
            Shippie
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              margin: '0.25rem 0 var(--space-sm)',
              letterSpacing: '-0.02em',
            }}
          >
            Leaderboards
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 580, lineHeight: 1.5 }}>
            What&apos;s moving across the marketplace — this week&apos;s trending apps, brand-new
            launches, and the highest-rated tools on Shippie.
          </p>
        </header>

        <Shelf
          title="Trending this week"
          subtitle="Most installs, last 7 days"
          kind="trending"
          entries={trending}
          emptyLabel="No trending installs this week. Be the first to ship something people want."
        />
        <Shelf
          title="New this week"
          subtitle="Launched recently"
          kind="new"
          entries={recent}
          emptyLabel="No new launches in the last two weeks."
        />
        <Shelf
          title="Top-rated"
          subtitle="3+ ratings, highest average"
          kind="rated"
          entries={topRated}
          emptyLabel="No apps with enough ratings yet. Install a few and rate them."
        />
      </main>
    </>
  );
}

function Shelf({
  title,
  subtitle,
  entries,
  kind,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  entries: LeaderboardEntry[];
  kind: ShelfKind;
  emptyLabel: string;
}) {
  return (
    <section style={{ marginBottom: 'var(--space-2xl)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-md)',
          paddingBottom: 'var(--space-sm)',
          borderBottom: '1px solid var(--border-light)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', margin: 0, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          <p style={{ color: 'var(--text-light)', fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>
        </div>
      </div>
      {entries.length === 0 ? (
        <p
          style={{
            color: 'var(--text-light)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            padding: 'var(--space-md)',
            border: '1px dashed var(--border-light)',
            margin: 0,
          }}
        >
          {emptyLabel}
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--space-md)',
          }}
        >
          {entries.map((e) => (
            <AppCard key={e.slug} entry={e} kind={kind} />
          ))}
        </div>
      )}
    </section>
  );
}
