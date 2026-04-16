import { RocketMark } from './components/rocket-mark';

export default function RootLoading() {
  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ animation: 'shimmer 1.5s ease-in-out infinite' }}>
        <RocketMark size={64} />
      </div>
    </div>
  );
}
