/**
 * Settings — privacy banner + pair code view + leave-room.
 *
 * Privacy banner copy is verbatim from VOICE.md. Don't editorialise.
 */
import { useState } from 'react';
import type { Pairing } from '../sync/pairing.ts';

interface Props {
  pairing: Pairing;
  onLeaveRoom: () => void;
}

export function SettingsPage({ pairing, onLeaveRoom }: Props) {
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  return (
    <section>
      <p className="co-page-eyebrow">Settings</p>
      <h2 className="co-page-title">This pairing</h2>

      <div className="co-section">
        <h3 className="co-section-title">Pair code</h3>
        <p className="co-pairing-code" data-size="md">{pairing.pairCode}</p>
        <p className="co-foot-note">
          You're parent {pairing.role.toUpperCase()} of this pairing. The other parent has the same code on their phone.
        </p>
      </div>

      <div className="co-section">
        <h3 className="co-section-title">Privacy</h3>
        <p>
          Co-Pilot stores everything on these two phones. We can't read what you write here, and there's
          no admin who can. If you both delete the app, the record is gone.
        </p>
      </div>

      <div className="co-section">
        <h3 className="co-section-title">Leave the pairing</h3>
        {!confirmingLeave ? (
          <button type="button" className="co-btn" onClick={() => setConfirmingLeave(true)}>
            Leave the pairing
          </button>
        ) : (
          <>
            <p className="co-foot-note">
              This removes the pair code from this phone. The other parent's phone still has the
              shared record. To rejoin, the other parent reads you the code again and you enter it.
            </p>
            <button type="button" className="co-btn" data-variant="primary" onClick={onLeaveRoom}>
              Confirm leave
            </button>
            <button type="button" className="co-btn" data-variant="ghost" data-size="sm" onClick={() => setConfirmingLeave(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
