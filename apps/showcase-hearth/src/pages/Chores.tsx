import { useState } from 'react';
import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  getChores,
  getRota,
  addChore,
  removeChore,
  markChoreDone,
  listMembers,
} from '../sync/hearth-doc.ts';
import type { Cadence } from '../sync/hearth-doc.ts';
import { whoseTurn, daysSince } from '../lib/rota.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
}

export function ChoresPage({ doc, myMemberId }: Props) {
  const chores = useYjs(doc, (d) => getChores(d).toArray());
  const rota = useYjs(doc, (d) => Object.fromEntries(getRota(d).entries()));
  const members = useYjs(doc, (d) => listMembers(d));

  const [draftLabel, setDraftLabel] = useState('');
  const [draftCadence, setDraftCadence] = useState<Cadence>('weekly');

  const presentIds = new Set(members.map((m) => m.id));
  const memberName = (id: string) => members.find((m) => m.id === id)?.member.name ?? '—';

  function add() {
    const label = draftLabel.trim();
    if (!label) return;
    addChore(doc, { label, cadence: draftCadence, rotaMembers: members.map((m) => m.id) });
    setDraftLabel('');
  }

  function done(choreId: string) {
    markChoreDone(doc, choreId, myMemberId);
    emitIntent('chore-done', { chore_id: choreId, done_by: myMemberId, done_at: Date.now() });
  }

  return (
    <section className="hearth-page">
      <p className="hearth-eyebrow">Chores</p>

      <h2 className="hearth-section-title">Add to the rota</h2>
      <input
        value={draftLabel}
        onChange={(e) => setDraftLabel(e.target.value)}
        placeholder="e.g. Hoover, Bins, Boiler check"
        className="hearth-input"
      />
      <div className="hearth-row">
        <label>
          Cadence:{' '}
          <select value={draftCadence} onChange={(e) => setDraftCadence(e.target.value as Cadence)}>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <button type="button" className="hearth-btn hearth-btn-primary" disabled={!draftLabel.trim()} onClick={add}>
          Add
        </button>
      </div>

      <h2 className="hearth-section-title">The rota</h2>
      {chores.length === 0 ? (
        <p className="hearth-empty">Nothing on the rota yet.</p>
      ) : (
        <ul className="hearth-list">
          {chores.map((c) => {
            const r = rota[c.id];
            const whoseId = r ? whoseTurn(r, presentIds) : null;
            const days = daysSince(c.last_done_at);
            return (
              <li key={c.id} className="hearth-chore-row">
                <div>
                  <strong>{c.label}</strong>
                  <span className="hearth-chore-meta">
                    {' · '}{c.cadence}
                    {' · '}whose turn: {whoseId ? memberName(whoseId) : '—'}
                    {days != null ? ` · last done ${days}d ago` : ''}
                  </span>
                </div>
                <div className="hearth-chore-actions">
                  <button type="button" className="hearth-btn hearth-btn-primary" onClick={() => done(c.id)}>
                    Mark done
                  </button>
                  <button type="button" className="hearth-btn hearth-btn-ghost" onClick={() => removeChore(doc, c.id)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
