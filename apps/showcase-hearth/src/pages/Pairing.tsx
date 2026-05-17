import { useState } from 'react';
import {
  generateRoomCode,
  generatePhrase,
  generateMemberId,
  savePairing,
  ROOM_CODE_REGEX,
  PHRASE_REGEX,
  type HousePairing,
} from '../sync/pairing.ts';

interface Props {
  onPaired: (p: HousePairing) => void;
}

export function PairingScreen({ onPaired }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(roomCode: string, phraseValue: string, displayName: string) {
    const pairing: HousePairing = {
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
      <div className="hearth-pairing">
        <h1>Hearth</h1>
        <p>The kitchen-table app. Pair with the people who live here.</p>
        <button type="button" className="hearth-btn hearth-btn-primary" onClick={() => setMode('create')}>
          Start a new house
        </button>
        <button type="button" className="hearth-btn" onClick={() => setMode('join')}>
          Join a house
        </button>
        <p className="hearth-pairing-foot">
          Hearth never sees your chores, fridge, or dinner. The relay only sees encrypted bytes.
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
      <div className="hearth-pairing">
        <h1>New house</h1>
        <p>Read these to your housemates. They enter both on their phones.</p>
        <div className="hearth-pairing-code">{generatedRoom}</div>
        <div className="hearth-pairing-phrase">{generatedPhrase}</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (e.g. Sara)"
          className="hearth-input"
        />
        <button
          type="button"
          className="hearth-btn hearth-btn-primary"
          disabled={!name.trim()}
          onClick={() => commit(generatedRoom, generatedPhrase, name.trim())}
        >
          Open the house
        </button>
        <button type="button" className="hearth-btn hearth-btn-ghost" onClick={() => setMode('choose')}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="hearth-pairing">
      <h1>Join the house</h1>
      <p>The room code and the phrase. Both, exactly as they were read out.</p>
      <input
        value={room}
        onChange={(e) => { setRoom(e.target.value.toUpperCase()); setError(null); }}
        placeholder="Room code (6 letters/numbers)"
        className="hearth-input"
      />
      <input
        value={phrase}
        onChange={(e) => { setPhrase(e.target.value.toUpperCase()); setError(null); }}
        placeholder="Phrase (e.g. STEADY-NORTH-LIGHT)"
        className="hearth-input"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="hearth-input"
      />
      {error ? <p className="hearth-error">{error}</p> : null}
      <button
        type="button"
        className="hearth-btn hearth-btn-primary"
        disabled={!room.trim() || !phrase.trim() || !name.trim()}
        onClick={() => {
          const r = room.trim().toUpperCase();
          const p = phrase.trim().toUpperCase();
          if (!ROOM_CODE_REGEX.test(r)) {
            setError("Room code is 6 letters/numbers (no I, O, 0, 1).");
            return;
          }
          if (!PHRASE_REGEX.test(p)) {
            setError("Phrase is three words separated by dashes (e.g. STEADY-NORTH-LIGHT).");
            return;
          }
          commit(r, p, name.trim());
        }}
      >
        Join
      </button>
      <button type="button" className="hearth-btn hearth-btn-ghost" onClick={() => setMode('choose')}>
        Back
      </button>
    </div>
  );
}
