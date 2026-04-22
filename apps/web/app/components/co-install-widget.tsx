// apps/web/app/components/co-install-widget.tsx
/**
 * Horizontal shelf showing apps that share users with the current one.
 * Pure presentation — caller hydrates the query result into `entries`.
 */
import Link from 'next/link';

export interface CoInstallCard {
  slug: string;
  name: string | null;
  taglineOrDesc: string | null;
  icon: string | null;
  score: number;
}

export function CoInstallWidget({ entries }: { entries: CoInstallCard[] }) {
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {entries.map((e) => (
        <Link
          key={e.slug}
          href={`/apps/${encodeURIComponent(e.slug)}`}
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
            {e.icon && (
              <img
                src={e.icon}
                alt=""
                width={40}
                height={40}
                style={{
                  borderRadius: 8,
                  flexShrink: 0,
                  objectFit: 'cover',
                  background: 'var(--surface-alt, #252019)',
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.name ?? e.slug}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                /{e.slug}
              </div>
            </div>
          </div>
          {e.taglineOrDesc && (
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
              {e.taglineOrDesc}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
