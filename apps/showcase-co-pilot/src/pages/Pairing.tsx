/**
 * Pairing — first-run setup.
 *
 * Two paths:
 *   - "Generate" — parent A creates a fresh pair code, reads it out to
 *     parent B (in person, on a call, in a text — outside the app).
 *   - "Enter" — parent B types the code parent A read to them.
 *
 * Both phones save the same pair code; that code, hashed, becomes the
 * shared room id. The relay never sees the readable code.
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

  function commit(pairCode: string, role: 'a' | 'b') {
    const pairing: Pairing = {
      pairCode,
      deviceId: generateDeviceId(),
      role,
      pairedAt: Date.now(),
    };
    savePairing(pairing);
    onPaired(pairing);
  }

  if (mode === 'choose') {
    return (
      <div className="co-pairing">
        <h1>Co-Pilot</h1>
        <p className="co-pairing-lede">
          Co-Pilot connects two phones — yours and the other parent's. Nothing is brokered by a company.
        </p>
        <button type="button" className="co-btn" data-variant="primary" data-size="lg" onClick={() => setMode('generate')}>
          Generate a pair code
        </button>
        <button type="button" className="co-btn" data-size="lg" onClick={() => setMode('enter')}>
          Enter a code I was given
        </button>
        <p className="co-pairing-foot">
          The pair code is not sent directly. The relay sees a hash of it, nothing more.
        </p>
      </div>
    );
  }

  if (mode === 'generate') {
    const generated = code || generatePairCode();
    if (!code) setCode(generated);
    return (
      <div className="co-pairing">
        <h1>Pair code</h1>
        <p className="co-pairing-lede">Read this to the other parent. They enter it on their phone.</p>
        <div className="co-pairing-code">{generated}</div>
        <button type="button" className="co-btn" data-variant="primary" data-size="lg" onClick={() => commit(generated, 'a')}>
          I've shared it — continue
        </button>
        <button type="button" className="co-btn" data-size="sm" data-variant="ghost" onClick={() => setMode('choose')}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="co-pairing">
      <h1>Enter pair code</h1>
      <p className="co-pairing-lede">Type the code the other parent read to you.</p>
      <input
        autoFocus
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null); }}
        placeholder="BIRCH-NORTH-3849"
        className="co-pairing-input"
      />
      {error ? <p className="co-pairing-error">{error}</p> : null}
      <button
        type="button"
        className="co-btn"
        data-variant="primary"
        data-size="lg"
        disabled={!code.trim()}
        onClick={() => {
          const norm = normalisePairCode(code);
          if (!isValidPairCode(norm)) {
            setError('That doesn\'t look like a pair code. Format: WORD-WORD-NUMBER.');
            return;
          }
          commit(norm, 'b');
        }}
      >
        Pair
      </button>
      <button type="button" className="co-btn" data-size="sm" data-variant="ghost" onClick={() => setMode('choose')}>
        Back
      </button>
    </div>
  );
}
