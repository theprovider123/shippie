import { useState } from 'react';
import type * as Y from 'yjs';
import { useYjs } from '../sync/useYjs.ts';
import { listMembers, readMeta, removeMember, updateMeta } from '../sync/tab-doc.ts';
import { MemberAvatar } from '../components/MemberAvatar.tsx';
import { listCurrencies } from '../lib/currency.ts';
import type { TabPairing } from '../sync/pairing.ts';

interface Props {
  doc: Y.Doc;
  pairing: TabPairing;
  onLeave: () => void;
}

export function MembersPage({ doc, pairing, onLeave }: Props) {
  const members = useYjs(doc, (d) => listMembers(d));
  const meta = useYjs(doc, (d) => readMeta(d));
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');

  const currency = meta?.currency ?? 'GBP';

  function setCurrency(code: string) {
    updateMeta(doc, { currency: code });
  }

  function setLabel() {
    if (!labelDraft.trim()) return;
    updateMeta(doc, { label: labelDraft.trim() });
    setLabelDraft('');
  }

  return (
    <section className="tab-page">
      <p className="tab-eyebrow">Members</p>

      <h2 className="tab-section-title">At the table</h2>
      <ul className="tab-members-list">
        {members.map((m) => (
          <li key={m.id} className="tab-member-row">
            <MemberAvatar name={m.member.name} />
            <span style={{ flex: 1 }}>
              {m.member.name}
              {m.id === pairing.memberId ? ' (you)' : ''}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="tab-section-title">Tab name</h2>
      <p className="tab-foot-note">
        Currently: <strong>{meta?.label || 'Untitled'}</strong>
      </p>
      <input
        className="tab-input"
        placeholder="Lisbon trip · Dinner Friday · House February"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
      />
      <button
        type="button"
        className="tab-btn"
        onClick={setLabel}
        disabled={!labelDraft.trim()}
      >
        Rename tab
      </button>

      <h2 className="tab-section-title">Currency</h2>
      <div className="tab-paid-by-row">
        {listCurrencies().map((c) => (
          <button
            key={c.code}
            type="button"
            className="tab-paid-by-chip"
            data-active={currency === c.code}
            onClick={() => setCurrency(c.code)}
          >
            {c.symbol} {c.code}
          </button>
        ))}
      </div>

      <h2 className="tab-section-title">Room</h2>
      <div className="tab-pairing-code">{pairing.roomCode}</div>
      <div className="tab-pairing-phrase">{pairing.phrase}</div>
      <p className="tab-foot-note">
        Read these to a new diner. They enter both on their phone.
      </p>

      <h2 className="tab-section-title">Privacy</h2>
      <p>
        Tab lives on these phones. The relay only sees encrypted bytes — not the items, not the
        amounts, not who paid.
      </p>

      <h2 className="tab-section-title">Leave the tab</h2>
      {!confirmLeave ? (
        <button type="button" className="tab-btn" onClick={() => setConfirmLeave(true)}>
          Leave the tab
        </button>
      ) : (
        <>
          <p className="tab-foot-note">
            This removes the room code from this phone. The other diners' phones still have the
            shared record. Get the code and phrase from someone to rejoin.
          </p>
          <button
            type="button"
            className="tab-btn tab-btn-primary"
            onClick={() => {
              removeMember(doc, pairing.memberId);
              onLeave();
            }}
          >
            Confirm leave
          </button>
          <button
            type="button"
            className="tab-btn tab-btn-ghost"
            onClick={() => setConfirmLeave(false)}
          >
            Cancel
          </button>
        </>
      )}
    </section>
  );
}
