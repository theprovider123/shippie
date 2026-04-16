/**
 * Reusable skeleton loading block with shimmer animation.
 */
export function Skeleton({ width, height, className = '' }: { width?: string | number; height?: string | number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />;
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 'var(--space-xl)' }}>
      <Skeleton width={56} height={56} />
      <div style={{ marginTop: 'var(--space-md)' }}><Skeleton width="60%" height={20} /></div>
      <div style={{ marginTop: 'var(--space-sm)' }}><Skeleton width="80%" height={14} /></div>
    </div>
  );
}
