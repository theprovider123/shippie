/**
 * Handover — chronological auditable thread.
 *
 * Entries can be acked but never deleted. The record might one day
 * matter to a third party (school, GP, family solicitor); the app
 * doesn't get to decide it didn't happen.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { ParentRole } from '../sync/pairing.ts';
import {
  addHandoverEntry,
  ackHandoverEntry,
  readHandover,
} from '../sync/coparent-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { HandoverEntry } from '../components/HandoverEntry.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: ParentRole;
}

export function HandoverPage({ doc, viewer }: Props) {
  const entries = useYjs(doc, (d) => readHandover(d));
  const [draft, setDraft] = useState('');

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const entry = addHandoverEntry(doc, viewer, trimmed);
    setDraft('');
    if (entry) emitIntent('coparent-handover-noted', { id: entry.id, written_at: entry.written_at });
  }

  // Most-recent first — the thread reads top-down.
  const ordered = [...entries].sort((a, b) => b.written_at - a.written_at);

  return (
    <section>
      <p className="co-page-eyebrow">Handover</p>
      <h2 className="co-page-title">The thread</h2>

      <div className="co-section">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What does the other parent need to know for pickup?"
        />
        <div className="co-form-actions">
          <button
            type="button"
            className="co-btn"
            data-variant="primary"
            data-size="lg"
            disabled={!draft.trim()}
            onClick={submit}
          >
            Add to handover
          </button>
        </div>
      </div>

      <div className="co-section">
        {ordered.length === 0 ? (
          <p className="co-empty">No items in handover yet.</p>
        ) : (
          ordered.map((entry) => (
            <HandoverEntry
              key={entry.id}
              entry={entry}
              viewer={viewer}
              onAck={(id) => ackHandoverEntry(doc, id, viewer)}
            />
          ))
        )}
      </div>

      <p className="co-foot-note">
        Past entries can be acked but never deleted. The record may matter later.
      </p>
    </section>
  );
}
