import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  addItem,
  getItems,
  getSettlements,
  listMembers,
  readMeta,
  removeItem,
} from '../sync/tab-doc.ts';
import { computeBalances } from '../lib/split-math.ts';
import { AddItemForm } from '../components/AddItemForm.tsx';
import { ItemRow } from '../components/ItemRow.tsx';
import { BalanceBar } from '../components/BalanceBar.tsx';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
}

export function TabPage({ doc, myMemberId }: Props) {
  const items = useYjs(doc, (d) => getItems(d).toArray());
  const settlements = useYjs(doc, (d) => getSettlements(d).toArray());
  const memberRows = useYjs(doc, (d) => listMembers(d));
  const meta = useYjs(doc, (d) => readMeta(d));

  const currency = meta?.currency ?? 'GBP';
  const members = memberRows.map((m) => ({ id: m.id, name: m.member.name }));
  const memberIds = members.map((m) => m.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? null;

  const balances = computeBalances({ items, memberIds, settlements });

  function handleAdd(input: {
    label: string;
    amount_cents: number;
    paid_by: string;
    split_among: string[];
  }) {
    const created = addItem(doc, input);
    emitIntent('tab-item-added', {
      id: created.id,
      label: created.label,
      amount_cents: created.amount_cents,
      currency,
    });
  }

  return (
    <section className="tab-page">
      <p className="tab-eyebrow">{meta?.label ? meta.label : 'The tab'}</p>

      <h2 className="tab-section-title">Add to the tab</h2>
      {members.length === 0 ? (
        <p className="tab-empty">Waiting for the others to join…</p>
      ) : (
        <AddItemForm
          members={members}
          myMemberId={myMemberId}
          currency={currency}
          onAdd={handleAdd}
        />
      )}

      <h2 className="tab-section-title">Running balance</h2>
      {members.length === 0 ? (
        <p className="tab-empty">Add yourself first by joining the tab.</p>
      ) : (
        <BalanceBar
          members={members}
          balances={balances}
          currency={currency}
          myMemberId={myMemberId}
        />
      )}

      <h2 className="tab-section-title">Items</h2>
      {items.length === 0 ? (
        <p className="tab-empty">No items yet. The first round goes here.</p>
      ) : (
        <ul className="tab-items-list">
          {items
            .slice()
            .reverse()
            .map((item) => {
              const splitNames =
                item.split_among.length === 0
                  ? []
                  : item.split_among.map((id) => nameOf(id) ?? 'someone');
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  paidByName={nameOf(item.paid_by)}
                  splitNames={splitNames}
                  currency={currency}
                  onRemove={(id) => removeItem(doc, id)}
                />
              );
            })}
        </ul>
      )}
    </section>
  );
}
