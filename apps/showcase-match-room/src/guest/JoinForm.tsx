import { useState } from 'react';
import type { Copy } from '../i18n.ts';

export function JoinForm(props: { copy: Copy }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    setError(null);
    try {
      const url = new URL(value.trim());
      const room = url.searchParams.get('room');
      const key = new URLSearchParams(url.hash.replace(/^#/, '')).get('k');
      if (!room || !key) {
        setError(props.copy.joinMissing);
        return;
      }
      url.searchParams.set('role', 'play');
      window.location.href = url.toString();
    } catch {
      setError(props.copy.joinInvalid);
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
      <label htmlFor="join-link">{props.copy.joinLabel}</label>
      <div className="join-row">
        <input
          id="join-link"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder={props.copy.joinPlaceholder}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button type="submit">{props.copy.joinButton}</button>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </form>
  );
}
