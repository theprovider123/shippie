/**
 * Home — a single page that waits.
 *
 * The voice doc is load-bearing here. Empty state reads:
 *   "Nothing written here yet. Use it however you'd like."
 * No "start your journey", no "track your first thought".
 *
 * If a gentle nudge from another app fired (poor sleep, low mood),
 * we show it as a quiet line near the top — once, with a dismiss.
 */
import { useEffect, useState } from 'react';
import { listNotes } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { Note } from '../db/schema.ts';
import { NoteList } from '../components/NoteList.tsx';

interface HomeProps {
  refreshKey: number;
  onNewNote: () => void;
  nudge: string | null;
  onDismissNudge: () => void;
}

export function Home({ refreshKey, onNewNote, nudge, onDismissNudge }: HomeProps) {
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listNotes(resolveLocalDb(), 30);
      if (!cancelled) setNotes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="page page-home">
      {nudge ? (
        <div className="nudge" role="status">
          <span>{nudge}</span>
          <button
            type="button"
            className="nudge-dismiss"
            aria-label="Dismiss"
            onClick={onDismissNudge}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="home-actions">
        <button type="button" className="primary" onClick={onNewNote}>
          Note something
        </button>
      </div>

      {notes === null ? (
        <p className="muted small">Loading.</p>
      ) : (
        <NoteList notes={notes} />
      )}
    </section>
  );
}
