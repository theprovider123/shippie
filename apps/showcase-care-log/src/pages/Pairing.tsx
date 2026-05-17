/**
 * Pairing — first-run setup.
 *
 * Three paths:
 *   - "Solo" — caregiver works alone. Saves a deterministic local-only pair code.
 *   - "Generate" — caregiver A creates a fresh pair code, reads it to caregiver B.
 *   - "Enter" — caregiver B types the code A read to them.
 *
 * Both paired phones save the same pair code; that code, hashed,
 * becomes the shared room id. The relay never sees the readable code.
 */
import { useState } from 'react';
import {
  generatePairCode,
  generateDeviceId,
  isValidPairCode,
  normalisePairCode,
  savePairing,
  type Pairing,
} from '../sync/pairing.ts';

interface Props {
  onPaired: (pairing: Pairing) => void;
}

export function PairingScreen({ onPaired }: Props) {
  const [mode, setMode] = useState<'choose' | 'generate' | 'enter'>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(pairCode: string, role: 'a' | 'b', solo: boolean) {
    const pairing: Pairing = {
      pairCode,
      deviceId: generateDeviceId(),
      role,
      pairedAt: Date.now(),
      solo,
    };
    savePairing(pairing);
    onPaired(pairing);
  }

  function commitSolo() {
    // Solo mode uses a local-only stable pair code so IndexedDB persists.
    // No relay is started (App.tsx checks `solo` before binding RelayProvider).
    commit('SOLO-LOCAL-0000', 'a', true);
  }

  if (mode === 'choose') {
    return (
      <div className="cl-pair-shell">
        <p className="cl-pair-eyebrow">Care Log</p>
        <h1 className="cl-pair-title">Track meds and symptoms for someone you care for.</h1>
        <p className="cl-pair-body">
          Use Care Log alone, or pair with another caregiver so you both see the latest dose
          and symptom log on your phones.
        </p>
        <div className="cl-pair-actions">
          <button
            type="button"
            className="cl-btn"
            data-variant="primary"
            data-size="lg"
            onClick={commitSolo}
          >
            Use solo
          </button>
          <button
            type="button"
            className="cl-btn"
            data-size="lg"
            onClick={() => setMode('generate')}
          >
            Pair with another caregiver — generate code
          </button>
          <button
            type="button"
            className="cl-btn"
            data-size="lg"
            onClick={() => setMode('enter')}
          >
            I have a code from another caregiver
          </button>
        </div>
        <p className="cl-pair-role-note">
          The pair code never leaves these phones. The relay sees a hash of it, nothing more.
        </p>
      </div>
    );
  }

  if (mode === 'generate') {
    const generated = code || generatePairCode();
    if (!code) setCode(generated);
    return (
      <div className="cl-pair-shell">
        <p className="cl-pair-eyebrow">Pair code</p>
        <h1 className="cl-pair-title">Read this to the other caregiver.</h1>
        <p className="cl-pair-body">They open Care Log and enter this code.</p>
        <div className="cl-pair-code">{generated}</div>
        <div className="cl-pair-actions">
          <button
            type="button"
            className="cl-btn"
            data-variant="primary"
            data-size="lg"
            onClick={() => commit(generated, 'a', false)}
          >
            I've shared it — continue
          </button>
          <button type="button" className="cl-btn" data-size="sm" data-variant="ghost" onClick={() => setMode('choose')}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cl-pair-shell">
      <p className="cl-pair-eyebrow">Enter pair code</p>
      <h1 className="cl-pair-title">Type the code the other caregiver read to you.</h1>
      <input
        autoFocus
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null); }}
        placeholder="BIRCH-NORTH-3849"
        className="cl-pair-input"
      />
      {error ? <p className="cl-mute">{error}</p> : null}
      <div className="cl-pair-actions">
        <button
          type="button"
          className="cl-btn"
          data-variant="primary"
          data-size="lg"
          disabled={!code.trim()}
          onClick={() => {
            const norm = normalisePairCode(code);
            if (!isValidPairCode(norm)) {
              setError('That doesn\'t look like a pair code. Format: WORD-WORD-NUMBER.');
              return;
            }
            commit(norm, 'b', false);
          }}
        >
          Pair
        </button>
        <button type="button" className="cl-btn" data-size="sm" data-variant="ghost" onClick={() => setMode('choose')}>
          Back
        </button>
      </div>
    </div>
  );
}
