import { useState } from 'react';
import type { FamilyPairing } from '../sync/pairing.ts';
import {
  generateFamilyCode,
  generatePairingId,
  FAMILY_CODE_PATTERN,
} from '../sync/pairing.ts';

interface Props {
  pairings: FamilyPairing[];
  onChange: (next: FamilyPairing[]) => void;
  onBack: () => void;
}

export function PairingPage({ pairings, onChange, onBack }: Props) {
  const [mode, setMode] = useState<'idle' | 'add'>('idle');
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function addNew() {
    setError(null);
    const trimmedLabel = label.trim();
    const norm = code.trim().toUpperCase();
    if (!trimmedLabel) { setError('Pick a label, e.g. Granny.'); return; }
    if (!FAMILY_CODE_PATTERN.test(norm)) {
      setError('Family code looks like WORD-WORD-NUMBER (e.g. STEADY-NORTH-1234).');
      return;
    }
    const next = [
      ...pairings,
      {
        id: generatePairingId(),
        label: trimmedLabel,
        familyCode: norm,
        pairedAt: Date.now(),
      },
    ];
    onChange(next);
    setMode('idle');
    setLabel('');
    setCode('');
  }

  function remove(id: string) {
    onChange(pairings.filter((p) => p.id !== id));
  }

  return (
    <section className="ss-pairing">
      <button type="button" className="ss-btn ss-btn-ghost" onClick={onBack}>← Back</button>
      <p className="ss-eyebrow">Pairing</p>
      <h2 className="ss-section-title">Paired family</h2>

      {pairings.length === 0 ? (
        <p className="ss-empty">No paired family yet.</p>
      ) : (
        <ul className="ss-pairing-list">
          {pairings.map((p) => (
            <li key={p.id} className="ss-pairing-row">
              <span className="ss-pairing-label">{p.label}</span>
              <span className="ss-pairing-code">{p.familyCode}</span>
              <button type="button" className="ss-btn ss-btn-ghost" onClick={() => remove(p.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'idle' ? (
        <button type="button" className="ss-btn ss-btn-primary" onClick={() => { setMode('add'); setCode(generateFamilyCode()); }}>
          Add a family member
        </button>
      ) : (
        <div className="ss-section">
          <label className="ss-label">
            Their label
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Granny" className="ss-input" />
          </label>
          <p className="ss-foot-note">Read the code below to them. They enter it on their phone.</p>
          <p className="ss-pairing-code">{code}</p>
          {error ? <p className="ss-error">{error}</p> : null}
          <button type="button" className="ss-btn ss-btn-primary" onClick={addNew}>I've shared it — save</button>
          <button type="button" className="ss-btn ss-btn-ghost" onClick={() => { setMode('idle'); setError(null); }}>Cancel</button>
        </div>
      )}

      <p className="ss-foot-note">
        Pairings are saved on this phone only. Shared stories travel via a link the parent
        sends — Story Studio doesn't run a server.
      </p>
    </section>
  );
}
