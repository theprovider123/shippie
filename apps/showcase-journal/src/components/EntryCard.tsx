import type { JournalEntry } from '../db/schema.ts';
import { MoodBadge } from './MoodBadge.tsx';

export interface EntryCardProps {
  entry: JournalEntry;
  onOpen?: () => void;
  onShare?: () => void;
  highlight?: string;
}

export function EntryCard({ entry, onOpen, onShare, highlight }: EntryCardProps) {
  const date = entry.created_at ? new Date(entry.created_at) : null;
  const dateLabel = date ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const preview = entry.body.slice(0, 220);
  // Root is a div+role so we can nest a real <button> for Share without
  // breaking HTML semantics.
  return (
    <div
      className="entry-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="entry-card-header">
        <span className="entry-card-date">{dateLabel}</span>
        {entry.topic && entry.topic !== 'unclassified' ? (
          <span className="entry-card-topic">{entry.topic}</span>
        ) : null}
        <MoodBadge label={entry.sentiment_label ?? null} score={entry.sentiment ?? null} />
        {onShare ? (
          <button
            type="button"
            className="entry-card-share"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            aria-label="Share this entry"
          >
            ↗
          </button>
        ) : null}
      </header>
      {entry.title ? <h3 className="entry-card-title">{entry.title}</h3> : null}
      <p className="entry-card-body">{preview}{entry.body.length > preview.length ? '…' : ''}</p>
      {highlight ? <p className="entry-card-highlight">{highlight}</p> : null}
    </div>
  );
}
