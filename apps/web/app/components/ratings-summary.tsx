// apps/web/app/components/ratings-summary.tsx
/**
 * Pure presentation for a ratings summary + distribution + latest reviews.
 * Used on both the public app detail page and the maker dashboard.
 */
import type { RatingSummary, LatestReview } from '@/lib/shippie/ratings';

interface Props {
  summary: RatingSummary;
  latest: LatestReview[];
}

export function RatingsSummary({ summary, latest }: Props) {
  const total = summary.count;
  const max = Math.max(
    summary.distribution[1],
    summary.distribution[2],
    summary.distribution[3],
    summary.distribution[4],
    summary.distribution[5],
    1,
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--text)' }}>
          {total === 0 ? '—' : summary.average.toFixed(1)}
        </span>
        <span style={{ color: 'var(--sunset, #E8603C)' }}>★</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {total === 0 ? 'No ratings yet' : `${total.toLocaleString()} rating${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const n = summary.distribution[star as 1 | 2 | 3 | 4 | 5];
            return (
              <div key={star} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 40px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{star}★</span>
                <div style={{ height: 8, background: 'var(--surface, #1E1A15)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(n / max) * 100}%`,
                      height: '100%',
                      background: 'var(--sunset, #E8603C)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'right' }}>{n}</span>
              </div>
            );
          })}
        </div>
      )}

      {latest.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {latest.map((r) => (
            <div
              key={`${r.userId}-${r.createdAt.toISOString()}`}
              style={{ padding: 12, background: 'var(--surface, #1E1A15)', borderRadius: 8 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: 'var(--sunset, #E8603C)' }}>{'★'.repeat(r.rating)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
                  {r.userId.slice(0, 8)}
                </span>
              </div>
              {r.review && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {r.review}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
