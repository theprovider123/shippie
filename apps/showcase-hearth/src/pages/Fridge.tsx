import { useState } from 'react';
import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  getFridge,
  addFridgeItem,
  removeFridgeItem,
  listMembers,
} from '../sync/hearth-doc.ts';
import { FridgeRow } from '../components/FridgeRow.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
}

export function FridgePage({ doc, myMemberId }: Props) {
  const items = useYjs(doc, (d) => getFridge(d).toArray());
  const members = useYjs(doc, (d) => listMembers(d));

  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('');

  const memberName = (id: string) => members.find((m) => m.id === id)?.member.name ?? null;

  function add() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const item = addFridgeItem(doc, {
      label: trimmed,
      qty_text: qty.trim(),
      added_by: myMemberId,
    });
    emitIntent('fridge-added', { id: item.id, label: item.label });
    setLabel('');
    setQty('');
  }

  return (
    <section className="hearth-page">
      <p className="hearth-eyebrow">Fridge</p>
      <h2 className="hearth-section-title">What did we just put in?</h2>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. eggs, leek, olive oil"
        className="hearth-input"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="how much (free text — 'half a leek', '6 eggs')"
        className="hearth-input"
      />
      <button type="button" className="hearth-btn hearth-btn-primary" disabled={!label.trim()} onClick={add}>
        Add
      </button>

      <h2 className="hearth-section-title">In the fridge</h2>
      {items.length === 0 ? (
        <p className="hearth-empty">Fridge is empty.</p>
      ) : (
        <ul className="hearth-list">
          {items.map((item) => (
            <FridgeRow
              key={item.id}
              item={item}
              addedByName={memberName(item.added_by)}
              onRemove={(id) => removeFridgeItem(doc, id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
