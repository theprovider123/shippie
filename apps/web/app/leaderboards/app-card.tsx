import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/shippie/leaderboards';

export function AppCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <Link
      href={`/apps/${encodeURIComponent(entry.slug)}`}
      style={{
        display: 'block',
        padding: 14,
        background: 'var(--surface, #1E1A15)',
        border: '1px solid var(--border, #3D3530)',
        borderRadius: 10,
        textDecoration: 'none',
        color: 'var(--text)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        {entry.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.icon}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover', background: 'var(--surface-alt, #252019)' }}
          />
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
    </Link>
  );
}
