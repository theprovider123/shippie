import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  getItems,
  getSettlements,
  listMembers,
  readMeta,
  recordSettlement,
} from '../sync/tab-doc.ts';
import { computeBalances } from '../lib/split-math.ts';
import { netSettlements, type Transfer } from '../lib/netting.ts';
import { SettlementMatrix } from '../components/SettlementMatrix.tsx';
import { formatCents } from '../lib/currency.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
}

export function SettlementPage({ doc, myMemberId }: Props) {
  const items = useYjs(doc, (d) => getItems(d).toArray());
  const settlements = useYjs(doc, (d) => getSettlements(d).toArray());
  const memberRows = useYjs(doc, (d) => listMembers(d));
  const meta = useYjs(doc, (d) => readMeta(d));

  const currency = meta?.currency ?? 'GBP';
  const members = memberRows.map((m) => ({ id: m.id, name: m.member.name }));
  const memberIds = members.map((m) => m.id);
  const balances = computeBalances({ items, memberIds, settlements });
  const transfers = netSettlements(balances);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'someone';

  function handleSettle(t: Transfer) {
    const entry = recordSettlement(doc, {
      from: t.from,
      to: t.to,
      amount_cents: t.amount_cents,
    });
    emitIntent('tab-settled', {
      id: entry.id,
      from: entry.from,
      to: entry.to,
      amount_cents: entry.amount_cents,
      currency,
    });
  }

  const sortedHistory = settlements
    .slice()
    .sort((a, b) => b.settled_at - a.settled_at)
    .slice(0, 8);

  return (
    <section className="tab-page">
      <p className="tab-eyebrow">Settle up</p>

      <h2 className="tab-section-title">Who pays who</h2>
      <p className="tab-foot-note">
        Smallest possible number of transfers. Tap "Mark paid" once cash, transfer, or whatever
        actually changes hands.
      </p>
      <SettlementMatrix
        members={members}
        transfers={transfers}
        currency={currency}
        myMemberId={myMemberId}
        onSettle={handleSettle}
      />

      <h2 className="tab-section-title">Already settled</h2>
      {sortedHistory.length === 0 ? (
        <p className="tab-empty">No settlements yet.</p>
      ) : (
        <ul className="tab-settlement-history">
          {sortedHistory.map((s) => (
            <li key={s.id}>
              {nameOf(s.from)} → {nameOf(s.to)} · {formatCents(s.amount_cents, currency)}
            </li>
          ))}
        </ul>
      )}

      <p className="tab-foot-note">
        We round to the penny. Across many items, balances may show £0.01–£0.02 leftover.
      </p>
    </section>
  );
}
