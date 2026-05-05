import { useState } from 'react';

export function JoinForm() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    setError(null);
    try {
      const url = new URL(value.trim());
      const room = url.searchParams.get('room');
      const key = new URLSearchParams(url.hash.replace(/^#/, '')).get('k');
      if (!room || !key) {
        setError('Paste the full guest link from the host board.');
        return;
      }
      url.searchParams.set('role', 'play');
      window.location.href = url.toString();
    } catch {
      setError('Paste a matchday link.');
    }
  };

  return (
    <form
      className="join-form"
      onSubmit={(event) => {
        event.preventDefault();
        join();
      }}
    >
      <label htmlFor="join-link">Guest link</label>
      <div className="join-row">
        <input
          id="join-link"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder="https://shippie.app/run/matchday/?role=play..."
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button type="submit">Join</button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  );
}
