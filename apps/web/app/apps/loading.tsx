import { SkeletonCard } from '../components/skeleton';

export default function AppsLoading() {
  return (
    <div style={{ padding: 'var(--section-pad) 0' }}>
      <div className="wrap">
        <div className="skeleton" style={{ width: '40%', height: 48, marginBottom: 'var(--space-xl)' }} />
        <div className="skeleton" style={{ width: '60%', height: 20, marginBottom: 'var(--space-3xl)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}
