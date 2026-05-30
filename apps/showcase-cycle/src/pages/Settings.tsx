/**
 * Settings — the trust surface: mode, privacy/lock, data ownership, partner
 * and clinician sharing, and "when to seek care" education.
 *
 * Voice doc invariants:
 *   - Privacy banner copy is verbatim from VOICE.md.
 *   - Sharing is OFF by default and structural (no relay opens when off).
 *   - Medical words, no euphemisms; predictions are tools, not oracles.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { BackupCard } from '@shippie/showcase-kit-v2';
import { isoDate, loadPrefs, savePrefs } from '../db/queries.ts';
import { deleteAllData, downloadExport, exportAll, exportForClinician } from '../lib/data-ops.ts';
import { createCycleBackupStore } from '../backup-store.ts';
import { generatePairCode } from '../sync/crypto.ts';
import {
  MODES,
  MODE_META,
  type ClinicianShare,
  type Mode,
  type PartnerSeenFields,
  type PrefsView,
} from '../db/schema.ts';

export interface SettingsProps {
  db: ShippieLocalDb;
  onChange: () => void;
}

const PRIVACY_BANNER =
  'These records exist on this phone only. Cycle has no servers. If you choose to share with a partner, only the two of you have the keys.';

const FIELD_COPY: Record<keyof PartnerSeenFields, string> = {
  cycle_day: 'cycle day (e.g. "on day 3")',
  fertile_window: 'fertile window (date range only)',
  predicted_period: 'predicted next period (date range only)',
  flow_today: "today's flow",
};

const CLINICIAN_COPY: Record<keyof Omit<ClinicianShare, 'from_date'>, string> = {
  include_cycles: 'cycle start dates + lengths',
  include_symptoms: 'symptoms, pain, mood, energy',
  include_flow: 'flow / bleeding',
  include_notes: 'freeform notes',
  include_intimacy: 'intimacy log (most sensitive)',
};

export function Settings({ db, onChange }: SettingsProps) {
  const [prefs, setPrefs] = useState<PrefsView | null>(null);
  const [pairInput, setPairInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const backupStore = useMemo(() => createCycleBackupStore(db), [db]);

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

  if (!prefs) return <section className="page settings"><p className="muted">Loading…</p></section>;

  const p = prefs;

  function toggleShare(): void {
    if (p.share_with_partner) {
      void persist({ ...p, share_with_partner: false, partner_pair_code: null });
      setPairInput('');
    } else {
      void persist({ ...p, share_with_partner: true });
    }
  }

  function toggleField(key: keyof PartnerSeenFields): void {
    void persist({ ...p, partner_seen_fields: { ...p.partner_seen_fields, [key]: !p.partner_seen_fields[key] } });
  }

  function toggleClinician(key: keyof Omit<ClinicianShare, 'from_date'>): void {
    void persist({ ...p, clinician_share: { ...p.clinician_share, [key]: !p.clinician_share[key] } });
  }

  async function handleExportFull(): Promise<void> {
    downloadExport(await exportAll(db, new Date().toISOString()), `cycle-export-${isoDate()}.json`);
  }

  async function handleExportClinician(): Promise<void> {
    downloadExport(await exportForClinician(db, p.clinician_share, new Date().toISOString()), `cycle-clinician-${isoDate()}.json`);
  }

  async function handleDeleteAll(): Promise<void> {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteAllData(db);
    setConfirmDelete(false);
    setPrefs(await loadPrefs(db));
    onChange();
  }

  return (
    <section className="page settings">
      <header className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Privacy and your body</h1>
      </header>

      <article className="privacy-banner" aria-label="Privacy">
        <p>{PRIVACY_BANNER}</p>
      </article>

      {/* ── Mode ── */}
      <article className="setting-row stack">
        <div>
          <h2>What are you tracking?</h2>
          <p className="muted">This reframes the whole app — which fields show, whether predictions run, and how it reads. Change it anytime; nothing is assumed about you.</p>
        </div>
        <div className="mode-grid">
          {MODES.map((m: Mode) => (
            <button
              key={m}
              type="button"
              className={p.mode === m ? 'mode-chip selected' : 'mode-chip'}
              aria-pressed={p.mode === m}
              onClick={() => void persist({ ...p, mode: m })}
            >
              <strong>{MODE_META[m].label}</strong>
              <small>{MODE_META[m].blurb}</small>
            </button>
          ))}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={p.gender_neutral}
            onChange={() => void persist({ ...p, gender_neutral: !p.gender_neutral })}
          />
          <span>Gender-neutral language everywhere</span>
        </label>
      </article>

      {/* ── App lock ── */}
      <article className="setting-row stack">
        <div>
          <h2>App lock</h2>
          <p className="muted">An optional PIN screen when Cycle opens — a deterrent for a borrowed or seized phone. It gates the screen; your data is already only on this device.</p>
        </div>
        {p.lock_pin ? (
          <div className="pair-input-row">
            <span className="day-code">PIN set</span>
            <button type="button" className="secondary" onClick={() => void persist({ ...p, lock_pin: null, decoy_pin: null })}>
              Remove lock
            </button>
          </div>
        ) : (
          <div className="pair-input-row">
            <input
              type="text"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="4–6 digit PIN"
              aria-label="Set app lock PIN"
            />
            <button
              type="button"
              disabled={pinInput.length < 4}
              onClick={() => {
                void persist({ ...p, lock_pin: pinInput });
                setPinInput('');
              }}
            >
              Set lock
            </button>
          </div>
        )}
      </article>

      {/* ── Data ownership ── */}
      <article className="setting-row stack">
        <div>
          <h2>Your data</h2>
          <p className="muted">Export a readable copy anytime, or delete everything for good. No lock-in, no recovery server — deletion is final.</p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => void handleExportFull()}>Export everything (JSON)</button>
          <button
            type="button"
            className={confirmDelete ? 'primary' : 'secondary'}
            onClick={() => void handleDeleteAll()}
          >
            {confirmDelete ? 'Tap again to permanently delete' : 'Delete all data'}
          </button>
          {confirmDelete ? (
            <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          ) : null}
        </div>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          Or keep an encrypted backup you can restore on a new device. The passphrase is the only key — lose it
          and the file is unreadable. That's the point.
        </p>
        <BackupCard appSlug="cycle" store={backupStore} />
      </article>

      {/* ── Partner sharing ── */}
      <article className="setting-row">
        <div>
          <h2>Share with a partner</h2>
          <p className="muted">Solo is the default. When off, no network connection opens. When on, you both enter a pair code and only the fields you pick leave this phone — encrypted with a key derived from the code.</p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={p.share_with_partner} onChange={toggleShare} />
          <span>{p.share_with_partner ? 'Sharing on' : 'Sharing off'}</span>
        </label>
      </article>

      {p.share_with_partner ? (
        <>
          <article className="setting-row">
            <div>
              <h2>Pair code</h2>
              <p className="muted">Both phones enter the same code. It never leaves either device — it derives the key locally.</p>
            </div>
            <div className="pair-input-row">
              <input
                type="text"
                value={pairInput}
                onChange={(e) => setPairInput(e.target.value.toUpperCase())}
                onBlur={(e) => void persist({ ...p, partner_pair_code: e.target.value.trim().toUpperCase() || null })}
                placeholder="TENDER-CRANE-3849"
                aria-label="Partner pair code"
              />
              <button type="button" onClick={() => { const c = generatePairCode(); setPairInput(c); void persist({ ...p, partner_pair_code: c }); }}>Generate</button>
            </div>
          </article>

          <article className="setting-row">
            <div>
              <h2>What a partner sees</h2>
              <p className="muted">Pick the smallest set. Anything off here never leaves the phone, even while sharing is on.</p>
            </div>
            <ul className="field-list">
              {(Object.keys(FIELD_COPY) as Array<keyof PartnerSeenFields>).map((key) => (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={p.partner_seen_fields[key]} onChange={() => toggleField(key)} />
                    <span>{FIELD_COPY[key]}</span>
                  </label>
                </li>
              ))}
            </ul>
          </article>
        </>
      ) : null}

      {/* ── Clinician sharing (field-selective export) ── */}
      <article className="setting-row stack">
        <div>
          <h2>Share with a clinician</h2>
          <p className="muted">Build a field-selective export to show a doctor — offline, as a file you hand over, not a login. Intimacy and notes are off unless you add them.</p>
        </div>
        <ul className="field-list">
          {(Object.keys(CLINICIAN_COPY) as Array<keyof Omit<ClinicianShare, 'from_date'>>).map((key) => (
            <li key={key}>
              <label>
                <input type="checkbox" checked={p.clinician_share[key]} onChange={() => toggleClinician(key)} />
                <span>{CLINICIAN_COPY[key]}</span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" className="secondary" onClick={() => void handleExportClinician()}>Export selected fields (JSON)</button>
      </article>

      {/* ── Education ── */}
      <article className="setting-row stack seek-care">
        <div>
          <h2>When to seek care</h2>
          <p className="muted">General guidance, not a diagnosis. Consider talking to a clinician if you notice:</p>
        </div>
        <ul className="care-list">
          <li>Soaking through a pad or tampon every hour for several hours.</li>
          <li>Periods lasting longer than 7 days, or cycles shorter than 21 / longer than 35 days that are new for you.</li>
          <li>Bleeding between periods or after sex.</li>
          <li>Severe pain that stops you doing normal things, or pain that's new or worsening.</li>
          <li>No period for 3+ months when you're not pregnant or on a method that stops them.</li>
          <li>Any bleeding after menopause.</li>
        </ul>
        <p className="disclaimer">
          Cycle is a logbook and a pattern-spotter, not a medical device. It does not diagnose, and predictions
          are estimates. For anything that worries you, talk to a qualified clinician.
        </p>
      </article>

      {savedFlash ? <p className="saved-flag">Saved — on this device only.</p> : null}
    </section>
  );
}
