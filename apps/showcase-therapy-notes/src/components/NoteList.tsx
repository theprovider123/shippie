/**
 * Chronological list of recent notes. Headed by date; titles are
 * primary; bodies are previewed (first 240 chars). The empty state
 * is the load-bearing copy from VOICE.md — never replaced.
 */
import type { Note } from '../db/schema.ts';

interface NoteListProps {
  notes: ReadonlyArray<Note>;
  emptyText?: string;
  onOpen?: (id: string) => void;
}

const KIND_LABEL: Record<Note['kind'], string> = {
  free: 'Note',
  'thought-record': 'Thought record',
  values: 'Values',
  'check-in': 'Check-in',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function preview(body: string, max = 240): string {
  const stripped = body.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/\n{2,}/g, '\n').trim();
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, max).trimEnd()}…`;
}

export function NoteList({ notes, emptyText, onOpen }: NoteListProps) {
  if (notes.length === 0) {
    return (
      <div className="note-list-empty">
        <p>{emptyText ?? 'Nothing written here yet.'}</p>
        <p className="muted small">Use it however you'd like.</p>
      </div>
    );
  }

  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li key={n.id} className="note-card">
          {onOpen ? (
            <button type="button" className="note-card-button" onClick={() => onOpen(n.id)}>
              <NoteCardInner note={n} />
            </button>
          ) : (
            <NoteCardInner note={n} />
          )}
        </li>
      ))}
    </ul>
  );
}

function NoteCardInner({ note }: { note: Note }) {
  return (
    <>
      <header className="note-card-head">
        <span className="note-card-date">{formatDate(note.occurred_at)}</span>
        <span className="note-card-kind">{KIND_LABEL[note.kind]}</span>
      </header>
      {note.title ? <h3 className="note-card-title">{note.title}</h3> : null}
      <p className="note-card-preview">{preview(note.body_md)}</p>
    </>
  );
}
