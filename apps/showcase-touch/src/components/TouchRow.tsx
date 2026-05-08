import { TOUCH_KIND_ICON, TOUCH_KIND_LABEL, type Touch } from '../db/schema.ts';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  touch: Touch;
}

export function TouchRow({ touch }: Props) {
  const sentimentClass =
    touch.sentiment === '+' ? 'sentiment-pos' : touch.sentiment === '-' ? 'sentiment-neg' : 'sentiment-neu';
  return (
    <div className="touch-row">
      <div className="icon" aria-hidden>
        {TOUCH_KIND_ICON[touch.kind]}
      </div>
      <div className="body">
        <div className="when">
          {TOUCH_KIND_LABEL[touch.kind]} · {timeAgo(touch.happened_at)}
        </div>
        <div className={`summary ${sentimentClass}`}>
          {touch.summary || <span className="muted">no notes</span>}
        </div>
        {touch.link_url ? (
          <a href={touch.link_url} target="_blank" rel="noopener noreferrer" className="small">
            {touch.link_url}
          </a>
        ) : null}
      </div>
    </div>
  );
}
