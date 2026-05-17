import { formatDuration } from '../lib/audio.ts';
import type { Memo } from '../lib/store.ts';

interface Props {
  memo: Memo;
  onOpen: (id: string) => void;
}

export function MemoCard({ memo, onOpen }: Props) {
  const preview =
    memo.transcript.length > 140 ? `${memo.transcript.slice(0, 140).trim()}…` : memo.transcript.trim();
  const recorded = formatRecorded(memo.recorded_at);
  return (
    <button type="button" className="vm-memo-card" onClick={() => onOpen(memo.id)}>
      <div className="vm-memo-card-head">
        <span className="vm-memo-title">{memo.title || 'Untitled memo'}</span>
        <span className="vm-memo-meta muted small">
          {formatDuration(memo.duration_s)} · {recorded}
        </span>
      </div>
      <p className="vm-memo-preview muted small">
        {preview || <em>(transcript empty — open to edit)</em>}
      </p>
      {memo.tags.length > 0 ? (
        <div className="vm-memo-tags">
          {memo.tags.map((t) => (
            <span key={t} className="vm-tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function formatRecorded(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
