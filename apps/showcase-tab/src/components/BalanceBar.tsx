import { formatCents } from '../lib/currency.ts';
import type { Balances } from '../lib/split-math.ts';
import { MemberAvatar } from './MemberAvatar.tsx';

interface Member {
  id: string;
  name: string;
}

interface Props {
  members: Member[];
  balances: Balances;
  currency: string;
  myMemberId: string;
}

export function BalanceBar({ members, balances, currency, myMemberId }: Props) {
  return (
    <div className="tab-balance-bar">
      {members.map((m) => {
        const v = balances[m.id] ?? 0;
        const direction = v > 1 ? 'owed' : v < -1 ? 'owing' : 'even';
        const label =
          direction === 'owed'
            ? `is owed ${formatCents(v, currency)}`
            : direction === 'owing'
              ? `owes ${formatCents(-v, currency)}`
              : 'even';
        return (
          <div key={m.id} className="tab-balance-row">
            <MemberAvatar name={m.name} size="sm" />
            <span>
              {m.name}
              {m.id === myMemberId ? ' (you)' : ''} {label}
            </span>
            <span className="tab-balance-amount" data-direction={direction}>
              {direction === 'owing'
                ? formatCents(-v, currency)
                : direction === 'owed'
                  ? formatCents(v, currency)
                  : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
