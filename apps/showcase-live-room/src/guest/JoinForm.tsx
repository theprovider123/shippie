import { useState } from 'react';

interface JoinFormProps {
  onSubmit: (code: string) => void;
}

export function JoinForm({ onSubmit }: JoinFormProps) {
  const [raw, setRaw] = useState('');
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  return (
    <main className="guest-room">
      <h2 style={{ textAlign: 'center', margin: 0 }}>Enter the room code</h2>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (cleaned.length === 6) onSubmit(cleaned);
        }}
      >
        <label htmlFor="code" style={{ display: 'none' }}>
          Room code
        </label>
        <input
          id="code"
          autoComplete="off"
          inputMode="text"
          autoCapitalize="characters"
          autoFocus
          value={cleaned}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="------"
          maxLength={6}
        />
        <button type="submit" disabled={cleaned.length !== 6}>
          Join
        </button>
      </form>
    </main>
  );
}
