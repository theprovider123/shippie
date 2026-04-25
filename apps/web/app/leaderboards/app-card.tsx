import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/shippie/leaderboards';

const PALETTE = ['#E86A3C', '#C25E3A', '#8E4F36', '#4A8A8F', '#5B7553', '#9B6B4A', '#6B5B8C'];

function colorFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

type CardKind = 'trending' | 'new' | 'rated';

function badge(kind: CardKind, score: number): string | null {
  if (kind === 'trending') return score > 0 ? `↑ ${score} installs` : null;
  if (kind === 'rated') {
    const avg = score / 100;
    return Number.isFinite(avg) ? `★ ${avg.toFixed(1)}` : null;
  }
  if (kind === 'new') {
    const days = Math.max(0, Math.floor((Date.now() - score) / 86_400_000));
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }
  return null;
}

export function AppCard({ entry, kind }: { entry: LeaderboardEntry; kind: CardKind }) {
  const fallback = colorFor(entry.slug);
  const initial = (entry.name?.trim()?.[0] ?? entry.slug[0] ?? '?').toUpperCase();
  const meta = badge(kind, entry.score);

  return (
    <Link
      href={`/apps/${encodeURIComponent(entry.slug)}`}
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 'var(--space-md)' }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {entry.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.icon}
            alt=""
            width={48}
            height={48}
            style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover', background: 'var(--surface-alt, #252019)' }}
          />
        ) : (
          <div
            className="shippie-icon"
            style={{
              width: 48,
              height: 48,
              background: fallback,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EDE4D3',
              fontFamily: 'var(--font-heading)',
              fontSize: 22,
              fontWeight: 600,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name ?? entry.slug}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
            /{entry.slug}
          </div>
        </div>
      </div>
      {entry.taglineOrDesc && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {entry.taglineOrDesc}
        </p>
      )}
      {meta && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-light)',
            marginTop: 'auto',
          }}
        >
          {meta}
        </div>
      )}
    </Link>
  );
}
