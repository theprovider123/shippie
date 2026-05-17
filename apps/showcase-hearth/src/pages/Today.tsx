import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import {
  getChores,
  getRota,
  getFridge,
  getDinnerHistory,
  listMembers,
} from '../sync/hearth-doc.ts';
import { whoseTurn, isDue } from '../lib/rota.ts';
import { WhoseTurnPill } from '../components/WhoseTurnPill.tsx';
import type { Route } from '../router.ts';

interface Props {
  doc: Y.Doc;
  myMemberId: string;
  onNavigate: (r: Route) => void;
}

export function TodayPage({ doc, myMemberId, onNavigate }: Props) {
  const chores = useYjs(doc, (d) => getChores(d).toArray());
  const rota = useYjs(doc, (d) => Object.fromEntries(getRota(d).entries()));
  const members = useYjs(doc, (d) => listMembers(d));
  const fridgeCount = useYjs(doc, (d) => getFridge(d).length);
  const recentDinners = useYjs(doc, (d) => getDinnerHistory(d).toArray().slice(-3).reverse());

  const presentIds = new Set(members.map((m) => m.id));
  const memberName = (id: string) => members.find((m) => m.id === id)?.member.name ?? null;

  const dueChores = chores.filter((c) => isDue(c.cadence, c.last_done_at));
  const upcoming = (dueChores.length > 0 ? dueChores : chores).slice(0, 4);

  return (
    <section className="hearth-page">
      <p className="hearth-eyebrow">Today</p>

      <h2 className="hearth-section-title">Whose turn</h2>
      {chores.length === 0 ? (
        <p className="hearth-empty">Nothing on the rota yet.</p>
      ) : (
        <div className="hearth-turn-list">
          {upcoming.map((c) => {
            const r = rota[c.id];
            const whoseId = r ? whoseTurn(r, presentIds) : null;
            return (
              <WhoseTurnPill
                key={c.id}
                choreLabel={c.label}
                whoseName={whoseId ? memberName(whoseId) : null}
                isYou={whoseId === myMemberId}
              />
            );
          })}
        </div>
      )}

      <h2 className="hearth-section-title">In the fridge</h2>
      <p className="hearth-summary">
        {fridgeCount === 0 ? 'Fridge is empty.' : `${fridgeCount} note${fridgeCount === 1 ? '' : 's'}.`}{' '}
        <button type="button" className="hearth-btn-link" onClick={() => onNavigate('fridge')}>
          Open
        </button>
      </p>

      <h2 className="hearth-section-title">Recently eaten</h2>
      {recentDinners.length === 0 ? (
        <p className="hearth-empty">No dinners logged yet.</p>
      ) : (
        <ul className="hearth-list">
          {recentDinners.map((d) => (
            <li key={d.id}>
              <strong>{d.label}</strong>
              {d.who_cooked ? ` — cooked by ${memberName(d.who_cooked) ?? 'a housemate'}` : ''}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="hearth-btn hearth-btn-primary hearth-btn-block" onClick={() => onNavigate('dinner')}>
        What are we eating?
      </button>
    </section>
  );
}
