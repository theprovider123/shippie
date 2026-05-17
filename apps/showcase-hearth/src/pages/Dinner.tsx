import { useState } from 'react';
import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  getDinnerHistory,
  getFridge,
  recordDinner,
  listMembers,
} from '../sync/hearth-doc.ts';
import { pickDinner, DEFAULT_CANDIDATES } from '../lib/dinner-picker.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
}

export function DinnerPage({ doc, myMemberId }: Props) {
  const fridge = useYjs(doc, (d) => getFridge(d).toArray());
  const history = useYjs(doc, (d) => getDinnerHistory(d).toArray());
  const members = useYjs(doc, (d) => listMembers(d));

  const [customLabel, setCustomLabel] = useState('');

  const memberName = (id: string) => members.find((m) => m.id === id)?.member.name ?? null;

  const suggestion = pickDinner({
    fridge,
    history,
    candidates: DEFAULT_CANDIDATES,
    now: Date.now(),
  });

  function record(label: string) {
    if (!label.trim()) return;
    const entry = recordDinner(doc, { label: label.trim(), who_cooked: myMemberId });
    emitIntent('dinner-eaten', { id: entry.id, label: entry.label });
    setCustomLabel('');
  }

  return (
    <section className="hearth-page">
      <p className="hearth-eyebrow">Dinner</p>

      <h2 className="hearth-section-title">What are we eating?</h2>
      {suggestion ? (
        <div className="hearth-suggestion">
          <p className="hearth-suggestion-label">{suggestion.label}</p>
          <p className="hearth-suggestion-why">
            {suggestion.hint === 'we_have_it'
              ? `We've got ${suggestion.matched.join(', ') || 'what we need'} in.`
              : 'Could work with a top-up.'}
          </p>
          <button
            type="button"
            className="hearth-btn hearth-btn-primary"
            onClick={() => record(suggestion.label)}
          >
            Mark cooked
          </button>
        </div>
      ) : (
        <p className="hearth-empty">No suggestion right now. Type your own below.</p>
      )}

      <h2 className="hearth-section-title">Or just say what we made</h2>
      <input
        value={customLabel}
        onChange={(e) => setCustomLabel(e.target.value)}
        placeholder="e.g. pasta, leftovers, takeaway"
        className="hearth-input"
      />
      <button type="button" className="hearth-btn hearth-btn-primary" disabled={!customLabel.trim()} onClick={() => record(customLabel)}>
        Mark cooked
      </button>

      <h2 className="hearth-section-title">Recent dinners</h2>
      {history.length === 0 ? (
        <p className="hearth-empty">No dinners logged yet.</p>
      ) : (
        <ul className="hearth-list">
          {history.slice(-10).reverse().map((d) => (
            <li key={d.id}>
              <strong>{d.label}</strong>
              {d.who_cooked ? ` — cooked by ${memberName(d.who_cooked) ?? 'a housemate'}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
