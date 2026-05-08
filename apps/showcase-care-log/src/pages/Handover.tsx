/**
 * Handover — chronological auditable thread.
 *
 * Entries can be acked but never deleted. The record matters: the next
 * caregiver, a doctor, or a family meeting may rely on it.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { CaregiverRole } from '../sync/pairing.ts';
import {
  ackHandoverNote,
  addHandoverNote,
  readHandover,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { HandoverEntry } from '../components/HandoverEntry.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: CaregiverRole;
}

export function HandoverPage({ doc, viewer }: Props) {
  const entries = useYjs(doc, (d) => readHandover(d));
  const [draft, setDraft] = useState('');

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const entry = addHandoverNote(doc, viewer, trimmed);
    setDraft('');
    if (entry) {
      emitIntent('care-handover-noted', {
        id: entry.id,
        written_at: entry.written_at,
        author: viewer,
      });
    }
  }

  // Most-recent first — the thread reads top-down.
  const ordered = [...entries].sort((a, b) => b.written_at - a.written_at);

  return (
    <section>
      <p className="cl-page-eyebrow">Handover</p>
      <h2 className="cl-page-title">The thread</h2>

      <div className="cl-section">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="GP appointment Friday at 2pm. Nothing to eat from midnight."
        />
        <div className="cl-form-actions">
          <button
            type="button"
            className="cl-btn"
            data-variant="primary"
            data-size="lg"
            disabled={!draft.trim()}
            onClick={submit}
          >
            Add to handover
          </button>
        </div>
      </div>

      <div className="cl-section">
        {ordered.length === 0 ? (
          <p className="cl-empty">No items in handover yet.</p>
        ) : (
          ordered.map((entry) => (
            <HandoverEntry
              key={entry.id}
              entry={entry}
              viewer={viewer}
              onAck={(id) => ackHandoverNote(doc, id, viewer)}
            />
          ))
        )}
      </div>

      <p className="cl-foot-note">
        Past entries can be acked but never deleted. The record may matter later.
      </p>
    </section>
  );
}
