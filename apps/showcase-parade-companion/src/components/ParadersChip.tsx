import type { ParadersCount } from '../lib/paraders';

interface ParadersChipProps {
  count: ParadersCount;
}

/**
 * Crowd-energy chip — a mirror showing how many phones have tapped
 * "I am here" in the last few minutes. Renders below 3 to avoid
 * surveillance-y reveal of who tapped alone (and to skip the noise when the
 * relay's quiet).
 *
 * No leaderboard, no streak. The number is the message.
 */
export function ParadersChip({ count }: ParadersChipProps) {
  if (count.total < 3) return null;

  const totalLabel = formatCount(count.total);

  return (
    <div
      className="paraders-chip"
      role="status"
      aria-live="polite"
      aria-label={`${count.total} paraders syncing${count.nearby !== null ? `, ${count.nearby} within 500 metres` : ''}`}
    >
      <strong>~{totalLabel}</strong>
      <span>{count.total === 1 ? 'parader' : 'paraders'}</span>
      {count.nearby !== null && count.nearby >= 1 ? (
        <em>{count.nearby} near you</em>
      ) : null}
    </div>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
