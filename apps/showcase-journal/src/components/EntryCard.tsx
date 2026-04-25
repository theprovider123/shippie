import type { JournalEntry } from '../db/schema.ts';
import { MoodBadge } from './MoodBadge.tsx';

export interface EntryCardProps {
  entry: JournalEntry;
  onOpen?: () => void;
  highlight?: string;
}

export function EntryCard({ entry, onOpen, highlight }: EntryCardProps) {
  const date = entry.created_at ? new Date(entry.created_at) : null;
  const dateLabel = date ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const preview = entry.body.slice(0, 220);
  return (
    <button type="button" className="entry-card" onClick={onOpen}>
      <header className="entry-card-header">
        <span className="entry-card-date">{dateLabel}</span>
        {entry.topic && entry.topic !== 'unclassified' ? (
          <span className="entry-card-topic">{entry.topic}</span>
        ) : null}
        <MoodBadge label={entry.sentiment_label ?? null} score={entry.sentiment ?? null} />
      </header>
      {entry.title ? <h3 className="entry-card-title">{entry.title}</h3> : null}
      <p className="entry-card-body">{preview}{entry.body.length > preview.length ? '…' : ''}</p>
      {highlight ? <p className="entry-card-highlight">{highlight}</p> : null}
    </button>
  );
}
