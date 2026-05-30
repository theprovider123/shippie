/**
 * Settings — recipient name, pair code, recipient view pref, privacy.
 *
 * Privacy banner copy is verbatim from the brief. Don't editorialise.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { Pairing } from '../sync/pairing.ts';
import {
  readMeta,
  readPrefs,
  setPrefField,
  setRecipientName,
  type RecipientView,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';

interface Props {
  doc: Y.Doc;
  pairing: Pairing;
  onLeaveRoom: () => void;
}

export function SettingsPage({ doc, pairing, onLeaveRoom }: Props) {
  const meta = useYjs(doc, (d) => readMeta(d));
  const prefs = useYjs(doc, (d) => readPrefs(d));
  const [name, setName] = useState(meta.recipient_name);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  function saveName() {
    setRecipientName(doc, name);
  }

  function setView(v: RecipientView) {
    setPrefField(doc, 'recipient_view', v);
  }

  return (
    <section>
      <p className="cl-page-eyebrow">Settings</p>
      <h2 className="cl-page-title">This care record</h2>

      <div className="cl-section">
        <h3 className="cl-section-title">Care recipient</h3>
        <div className="cl-form-row">
          <span className="cl-form-label">Name (private to the paired devices)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mum, Dad, partner's first name…"
          />
        </div>
        <div className="cl-form-actions">
          <button
            type="button"
            className="cl-btn"
            data-size="sm"
            onClick={saveName}
          >
            Save
          </button>
        </div>
      </div>

      {!pairing.solo ? (
        <div className="cl-section">
          <h3 className="cl-section-title">Pair code</h3>
          <p className="cl-pair-code">{pairing.pairCode}</p>
          <p className="cl-foot-note">
            You're caregiver {pairing.role.toUpperCase()} of this pairing. Other caregiver has the
            same code on their phone.
          </p>
        </div>
      ) : (
        <div className="cl-section">
          <h3 className="cl-section-title">Solo mode</h3>
          <p className="cl-foot-note">
            Care Log is on this phone only. Leave to switch to a paired setup.
          </p>
        </div>
      )}

      <div className="cl-section">
        <h3 className="cl-section-title">Recipient's own view</h3>
        <p className="cl-mute" style={{ marginBottom: '0.5rem' }}>
          If the cared-for person opts in to seeing their own data on a third device,
          this is what they'll see. The third-device pairing path is not in this version
          — the toggle is here so the choice is recorded.
        </p>
        <div className="cl-toggle-row">
          {(['off', 'summary', 'full'] as RecipientView[]).map((v) => (
            <button
              key={v}
              type="button"
              className="cl-btn"
              data-size="sm"
              data-variant={prefs.recipient_view === v ? 'primary' : undefined}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-section">
        <h3 className="cl-section-title">Privacy</h3>
        <div className="cl-privacy-block">
          <p>
            <strong>Care records stay on the paired devices.</strong> Sync uses sealed relay traffic,
            so Shippie does not have readable access to what you write here.
          </p>
        </div>
      </div>

      <div className="cl-section">
        <h3 className="cl-section-title">Leave the pairing</h3>
        {!confirmingLeave ? (
          <button type="button" className="cl-btn" onClick={() => setConfirmingLeave(true)}>
            Leave the pairing
          </button>
        ) : (
          <>
            <p className="cl-foot-note">
              This removes the pair code from this phone. The other caregiver's phone still has the
              shared record. To rejoin, the other caregiver reads you the code again and you enter it.
            </p>
            <button type="button" className="cl-btn" data-variant="primary" onClick={onLeaveRoom}>
              Confirm leave
            </button>
            <button type="button" className="cl-btn" data-variant="ghost" data-size="sm" onClick={() => setConfirmingLeave(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
