import { METHOD_LABEL, type Brew } from '../db.ts';

interface BrewSessionRowProps {
  brew: Brew;
  showBean?: boolean;
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
        {new Date(brew.brewed_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}{' '}
        · {Math.floor(brew.brew_seconds / 60)}:
        {(brew.brew_seconds % 60).toString().padStart(2, '0')}
        {brew.taste_rating ? ` · ${'★'.repeat(brew.taste_rating)}` : ''}
      </div>
      {brew.note ? <p className="session-note">{brew.note}</p> : null}
    </li>
  );
}
