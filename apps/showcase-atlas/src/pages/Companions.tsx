import { useState } from 'react';
import { generateRoomCode, normalizeCode } from '../sync/room-code.ts';

const CODE_REGEX = /^[A-Z]{3}-[A-Z]{3}$/;

interface Companion {
  roomCode: string;
  passphrase: string;
}

const STORAGE_KEY = 'atlas:companion';

export function loadCompanion(): Companion | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Companion;
  } catch {
    return null;
  }
}

export function saveCompanion(c: Companion): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export function clearCompanion(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface Props {
  current: Companion | null;
  onChange: (c: Companion | null) => void;
}

export function CompanionsPage({ current, onChange }: Props) {
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle');
  const [code, setCode] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(roomCode: string, passphrase: string) {
    const c: Companion = { roomCode, passphrase };
    saveCompanion(c);
    onChange(c);
    setMode('idle');
    setCode('');
    setPhrase('');
    setError(null);
  }

  function leave() {
    clearCompanion();
    onChange(null);
  }

  if (current) {
    return (
      <section className="atlas-page">
        <p className="atlas-eyebrow">Companions</p>
        <h2 className="atlas-section-title">Travelling together</h2>
        <p className="atlas-foot-note">Companions see your stops as you pin them. The relay only sees encrypted bytes.</p>
        <p className="atlas-pairing-code">{current.roomCode}</p>
        <p className="atlas-pairing-phrase">passphrase saved on this phone</p>
        <button type="button" className="atlas-btn" onClick={leave}>
          Leave companion room
        </button>
      </section>
    );
  }

  return (
    <section className="atlas-page">
      <p className="atlas-eyebrow">Companions</p>
      <h2 className="atlas-section-title">Travel with someone</h2>
      <p className="atlas-foot-note">
        Solo trips work without this. Companion mode shares the trip's stops between phones.
      </p>

      {mode === 'idle' && (
        <>
          <button type="button" className="atlas-btn atlas-btn-primary" onClick={() => setMode('create')}>
            Create a room
          </button>
          <button type="button" className="atlas-btn" onClick={() => setMode('join')}>
            Join with a code
          </button>
        </>
      )}

      {mode === 'create' && (() => {
        const generated = code || generateRoomCode();
        if (!code) setCode(generated);
        return (
          <>
            <p className="atlas-pairing-code">{generated}</p>
            <input
              autoFocus
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Pick a passphrase you'll share with companions"
              className="atlas-input"
            />
            <button
              type="button"
              className="atlas-btn atlas-btn-primary"
              disabled={!phrase.trim()}
              onClick={() => commit(generated, phrase.trim())}
            >
              Open the room
            </button>
            <button type="button" className="atlas-btn atlas-btn-ghost" onClick={() => setMode('idle')}>Back</button>
          </>
        );
      })()}

      {mode === 'join' && (
        <>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            placeholder="ABC-DEF"
            className="atlas-input"
          />
          <input
            value={phrase}
            onChange={(e) => { setPhrase(e.target.value); setError(null); }}
            placeholder="Passphrase the room creator chose"
            className="atlas-input"
          />
          {error ? <p className="atlas-error">{error}</p> : null}
          <button
            type="button"
            className="atlas-btn atlas-btn-primary"
            disabled={!code.trim() || !phrase.trim()}
            onClick={() => {
              const norm = normalizeCode(code);
              if (!CODE_REGEX.test(norm)) {
                setError('Room code looks like ABC-DEF (six uppercase letters with a dash).');
                return;
              }
              commit(norm, phrase.trim());
            }}
          >
            Join
          </button>
          <button type="button" className="atlas-btn atlas-btn-ghost" onClick={() => setMode('idle')}>Back</button>
        </>
      )}
    </section>
  );
}
