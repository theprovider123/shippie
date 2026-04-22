/**
 * /leaderboards — public marketplace shelves.
 *
 * Three shelves: trending this week (most install-accepts in 7d), new
 * this week (apps created in 14d), and top-rated (>= 3 ratings).
 * Queries live in `@/lib/shippie/leaderboards`; this page just fetches
 * in parallel and renders a card grid per shelf.
 */
import { getDb } from '@/lib/db';
import { queryTrending, queryNew, queryTopRated } from '@/lib/shippie/leaderboards';
import { AppCard } from './app-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LeaderboardsPage() {
  const db = await getDb();
  const [trending, recent, topRated] = await Promise.all([
    queryTrending(db, {}),
    queryNew(db, {}),
    queryTopRated(db, {}),
  ]);

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: 'var(--space-xl, 2rem)' }}>
      <header style={{ marginBottom: 'var(--space-2xl, 3rem)' }}>
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
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', margin: '0.25rem 0 0' }}>
          Leaderboards
        </h1>
      </header>

      <Shelf
        title="Trending this week"
        subtitle="Most installs, last 7 days"
        entries={trending}
      />
      <Shelf title="New this week" subtitle="Launched recently" entries={recent} />
      <Shelf title="Top-rated" subtitle="3+ ratings, highest average" entries={topRated} />
    </main>
  );
}

function Shelf({
  title,
  subtitle,
  entries,
}: {
  title: string;
  subtitle: string;
  entries: Awaited<ReturnType<typeof queryTrending>>;
}) {
  if (entries.length === 0) return null;
  return (
    <section style={{ marginBottom: 'var(--space-2xl, 3rem)' }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', margin: '0 0 4px' }}>
        {title}
      </h2>
      <p style={{ color: 'var(--text-light)', fontSize: 13, margin: '0 0 16px' }}>{subtitle}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {entries.map((e) => (
          <AppCard key={e.slug} entry={e} />
        ))}
      </div>
    </section>
  );
}
