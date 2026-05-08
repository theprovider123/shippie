import { formatCents } from '../lib/currency.ts';
import type { Transfer } from '../lib/netting.ts';

interface Member {
  id: string;
  name: string;
}

interface Props {
  members: Member[];
  transfers: Transfer[];
  currency: string;
  myMemberId: string;
  onSettle: (transfer: Transfer) => void;
}

export function SettlementMatrix({ members, transfers, currency, myMemberId, onSettle }: Props) {
  if (transfers.length === 0) {
    return <p className="tab-empty">All settled. Nice round.</p>;
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'someone';
  return (
    <ul className="tab-settlement-list">
      {transfers.map((t, i) => {
        const fromName = nameOf(t.from);
        const toName = nameOf(t.to);
        const involvesMe = t.from === myMemberId || t.to === myMemberId;
        return (
          <li key={`${t.from}-${t.to}-${i}`} className="tab-settlement-row">
            <div className="tab-settlement-text">
              <strong>{t.from === myMemberId ? 'You' : fromName}</strong>
              {' owes '}
              <strong>{t.to === myMemberId ? 'you' : toName}</strong>{' '}
              <span className="tab-settlement-amount">{formatCents(t.amount_cents, currency)}</span>
            </div>
            <button
              type="button"
              className="tab-btn"
              onClick={() => onSettle(t)}
              disabled={!involvesMe}
              title={involvesMe ? 'Mark as paid' : 'Only the people involved can mark a settlement'}
            >
              Mark paid
            </button>
          </li>
        );
      })}
    </ul>
  );
}
