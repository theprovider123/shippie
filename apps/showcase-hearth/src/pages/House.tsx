import { useState } from 'react';
import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import { listMembers } from '../sync/hearth-doc.ts';
import { HousemateAvatar } from '../components/HousemateAvatar.tsx';
import type { HousePairing } from '../sync/pairing.ts';

interface Props {
  doc: Y.Doc;
  pairing: HousePairing;
  onLeave: () => void;
}

export function HousePage({ doc, pairing, onLeave }: Props) {
  const members = useYjs(doc, (d) => listMembers(d));
  const [confirmLeave, setConfirmLeave] = useState(false);

  return (
    <section className="hearth-page">
      <p className="hearth-eyebrow">House</p>
      <h2 className="hearth-section-title">In this house</h2>
      <ul className="hearth-members-list">
        {members.map((m) => (
          <li key={m.id} className="hearth-member-row">
            <HousemateAvatar name={m.member.name} />
            <span>
              {m.member.name}
              {m.id === pairing.memberId ? ' (you)' : ''}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="hearth-section-title">Room</h2>
      <p className="hearth-pairing-code">{pairing.roomCode}</p>
      <p className="hearth-pairing-phrase">{pairing.phrase}</p>
      <p className="hearth-foot-note">
        Read these to a new housemate. They enter both on their phone.
      </p>

      <h2 className="hearth-section-title">Privacy</h2>
      <p>
        Hearth lives on the phones in this house. The relay only sees encrypted bytes —
        not chores, not what's in the fridge, not what's for dinner.
      </p>

      <h2 className="hearth-section-title">Leave the house</h2>
      {!confirmLeave ? (
        <button type="button" className="hearth-btn" onClick={() => setConfirmLeave(true)}>
          Leave the house
        </button>
      ) : (
        <>
          <p className="hearth-foot-note">
            This removes the room code from this phone. Other housemates' phones still
            have the shared record. To rejoin, get the code and phrase from a housemate.
          </p>
          <button type="button" className="hearth-btn hearth-btn-primary" onClick={onLeave}>
            Confirm leave
          </button>
          <button type="button" className="hearth-btn hearth-btn-ghost" onClick={() => setConfirmLeave(false)}>
            Cancel
          </button>
        </>
      )}
    </section>
  );
}
