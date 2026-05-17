import { useState } from 'react';
import {
  generateRoomCode,
  generatePhrase,
  generateMemberId,
  savePairing,
  ROOM_CODE_REGEX,
  PHRASE_REGEX,
  type TabPairing,
} from '../sync/pairing.ts';

interface Props {
  onPaired: (p: TabPairing) => void;
}

export function PairingScreen({ onPaired }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(roomCode: string, phraseValue: string, displayName: string) {
    const pairing: TabPairing = {
      roomCode,
      phrase: phraseValue,
      memberId: generateMemberId(),
      memberName: displayName,
      pairedAt: Date.now(),
    };
    savePairing(pairing);
    onPaired(pairing);
  }

  if (mode === 'choose') {
    return (
      <div className="tab-pairing">
        <h1>Tab</h1>
        <p>Split a bill across the table. No accounts. No bank scraping.</p>
        <button
          type="button"
          className="tab-btn tab-btn-primary"
          onClick={() => setMode('create')}
        >
          Start a tab
        </button>
        <button type="button" className="tab-btn" onClick={() => setMode('join')}>
          Join a tab
        </button>
        <p className="tab-pairing-foot">
          The room code lives only on these phones. The relay sees nothing — not the items, not the
          numbers.
        </p>
      </div>
    );
  }

  if (mode === 'create') {
    const generatedRoom = room || generateRoomCode();
    if (!room) setRoom(generatedRoom);
    const generatedPhrase = phrase || generatePhrase();
    if (!phrase) setPhrase(generatedPhrase);
    return (
      <div className="tab-pairing">
        <h1>New tab</h1>
        <p>Read these to the others. They enter both on their phones.</p>
        <div className="tab-pairing-code">{generatedRoom}</div>
        <div className="tab-pairing-phrase">{generatedPhrase}</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="tab-input"
        />
        <button
          type="button"
          className="tab-btn tab-btn-primary"
          disabled={!name.trim()}
          onClick={() => commit(generatedRoom, generatedPhrase, name.trim())}
        >
          Open the tab
        </button>
        <button type="button" className="tab-btn tab-btn-ghost" onClick={() => setMode('choose')}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="tab-pairing">
      <h1>Join a tab</h1>
      <p>The room code and the phrase. Both, exactly as they were read out.</p>
      <input
        value={room}
        onChange={(e) => {
          setRoom(e.target.value.toUpperCase());
          setError(null);
        }}
        placeholder="Room code (6 letters/numbers)"
        className="tab-input"
      />
      <input
        value={phrase}
        onChange={(e) => {
          setPhrase(e.target.value.toUpperCase());
          setError(null);
        }}
        placeholder="Phrase (e.g. FRESH-OLIVE-BREAD)"
        className="tab-input"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="tab-input"
      />
      {error ? <p className="tab-error">{error}</p> : null}
      <button
        type="button"
        className="tab-btn tab-btn-primary"
        disabled={!room.trim() || !phrase.trim() || !name.trim()}
        onClick={() => {
          const r = room.trim().toUpperCase();
          const p = phrase.trim().toUpperCase();
          if (!ROOM_CODE_REGEX.test(r)) {
            setError("Room code is 6 letters/numbers (no I, O, 0, 1).");
            return;
          }
          if (!PHRASE_REGEX.test(p)) {
            setError("Phrase is three words separated by dashes (e.g. FRESH-OLIVE-BREAD).");
            return;
          }
          commit(r, p, name.trim());
        }}
      >
        Join the tab
      </button>
      <button type="button" className="tab-btn tab-btn-ghost" onClick={() => setMode('choose')}>
        Back
      </button>
    </div>
  );
}
