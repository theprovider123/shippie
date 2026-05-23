import { METHOD_LABEL, type Brew } from '../db.ts';

interface BrewSessionRowProps {
  brew: Brew;
  showBean?: boolean;
}

// Recent brews read better as "2h ago" than "Mar 13, 14:22" — switch to
// relative timestamps for anything within the last 7 days, fall back to
// the absolute date format for older sessions.
function formatBrewedAt(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BrewSessionRow({ brew, showBean = true }: BrewSessionRowProps) {
  return (
    <li className="session-row">
      <div className="session-line">
        {showBean ? <strong>{brew.bean_name}</strong> : null}
        <span className="muted small">
          {brew.weight_g}g · 1:{brew.ratio} · {METHOD_LABEL[brew.method]}
        </span>
      </div>
      <div className="session-line muted small">
        <span title={new Date(brew.brewed_at).toLocaleString()}>
          {formatBrewedAt(brew.brewed_at)}
        </span>{' '}
        · {Math.floor(brew.brew_seconds / 60)}:
        {(brew.brew_seconds % 60).toString().padStart(2, '0')}
        {brew.taste_rating ? ` · ${'★'.repeat(brew.taste_rating)}` : ''}
      </div>
      {brew.note ? <p className="session-note">{brew.note}</p> : null}
    </li>
  );
}
