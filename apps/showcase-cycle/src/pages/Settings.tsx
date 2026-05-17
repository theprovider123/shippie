/**
 * Settings — privacy banner + partner-share toggle + (when toggled on)
 * pair code + fields-to-share picker.
 *
 * Voice doc invariants:
 *   - Privacy banner copy is verbatim from VOICE.md.
 *   - "Partner-share off" is the default. The toggle is structural —
 *     when off, we never open a relay connection.
 *   - Field copy uses the medical words. No euphemisms.
 */
import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { loadPrefs, savePrefs } from '../db/queries.ts';
import { generatePairCode } from '../sync/crypto.ts';
import type { PartnerSeenFields, PrefsView } from '../db/schema.ts';

export interface SettingsProps {
  db: ShippieLocalDb;
  onChange: () => void;
}

const PRIVACY_BANNER =
  'These records exist on this phone only. Cycle has no servers. If you choose to share with a partner, only the two of you have the keys.';

const FIELD_COPY: Record<keyof PartnerSeenFields, string> = {
  cycle_day: 'cycle day (e.g. "she is on day 3")',
  fertile_window: 'fertile window (date range only)',
  predicted_period: 'predicted next period (date range only)',
  flow_today: "today's flow",
};

export function Settings({ db, onChange }: SettingsProps) {
  const [prefs, setPrefs] = useState<PrefsView | null>(null);
  const [pairInput, setPairInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPrefs(db).then((p) => {
      if (cancelled) return;
      setPrefs(p);
      setPairInput(p.partner_pair_code ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  async function persist(next: PrefsView): Promise<void> {
    setPrefs(next);
    await savePrefs(db, next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
    onChange();
  }

  if (!prefs) return <section className="page settings"><p className="muted">Loading...</p></section>;

  function toggleShare(): void {
    if (!prefs) return;
    if (prefs.share_with_partner) {
      // Turning OFF: clear the pair code so a future toggle-on doesn't silently re-use it.
      void persist({
        ...prefs,
        share_with_partner: false,
        partner_pair_code: null,
      });
      setPairInput('');
    } else {
      void persist({ ...prefs, share_with_partner: true });
    }
  }

  function applyPairCode(value: string): void {
    if (!prefs) return;
    const code = value.trim().toUpperCase();
    void persist({ ...prefs, partner_pair_code: code || null });
  }

  function regenerateCode(): void {
    if (!prefs) return;
    const code = generatePairCode();
    setPairInput(code);
    void persist({ ...prefs, partner_pair_code: code });
  }

  function toggleField(key: keyof PartnerSeenFields): void {
    if (!prefs) return;
    const next = { ...prefs.partner_seen_fields, [key]: !prefs.partner_seen_fields[key] };
    void persist({ ...prefs, partner_seen_fields: next });
  }

  return (
    <section className="page settings">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Privacy and sharing</h1>
      </header>

      <article className="privacy-banner" aria-label="Privacy">
        <p>{PRIVACY_BANNER}</p>
      </article>

      <article className="setting-row">
        <div>
          <h2>Share with a partner</h2>
          <p className="muted">
            Solo is the default. When this is off, no network connection opens. When it's on, the two of you
            share a pair code and only the fields you pick below leave this phone — encrypted with a key
            derived from the code.
          </p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={prefs.share_with_partner} onChange={toggleShare} />
          <span>{prefs.share_with_partner ? 'Sharing on' : 'Sharing off'}</span>
        </label>
      </article>

      {prefs.share_with_partner ? (
        <>
          <article className="setting-row">
            <div>
              <h2>Pair code</h2>
              <p className="muted">
                Both phones enter the same code. The code never leaves either device — it derives the
                encryption key locally. If you change the code, sharing breaks until both sides match again.
              </p>
            </div>
            <div className="pair-input-row">
              <input
                type="text"
                value={pairInput}
                onChange={(e) => setPairInput(e.target.value.toUpperCase())}
                onBlur={(e) => applyPairCode(e.target.value)}
                placeholder="TENDER-CRANE-3849"
                aria-label="Partner pair code"
              />
              <button type="button" onClick={regenerateCode}>Generate</button>
            </div>
          </article>

          <article className="setting-row">
            <div>
              <h2>What partner sees</h2>
              <p className="muted">
                Pick the smallest set you want shared. Anything off here doesn't leave the phone, even when
                sharing is on.
              </p>
            </div>
            <ul className="field-list">
              {(Object.keys(FIELD_COPY) as Array<keyof PartnerSeenFields>).map((key) => (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={prefs.partner_seen_fields[key]}
                      onChange={() => toggleField(key)}
                    />
                    <span>{FIELD_COPY[key]}</span>
                  </label>
                </li>
              ))}
            </ul>
          </article>
        </>
      ) : null}

      {savedFlash ? <p className="saved-flag">Saved.</p> : null}
    </section>
  );
}
