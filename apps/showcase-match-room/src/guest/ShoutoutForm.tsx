import { useState } from 'react';

export function ShoutoutForm(props: { disabled: boolean; onSubmit: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const remaining = Math.max(0, 90 - text.length);

  return (
    <form
      className="shoutout-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (props.disabled) return;
        const ok = await props.onSubmit(text);
        if (ok) {
          setText('');
          setSentAt(Date.now());
        }
      }}
    >
      <label htmlFor="shoutout">Room message</label>
      <textarea
        id="shoutout"
        value={text}
        maxLength={90}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="Send a short line to everyone in the room"
      />
      <div className="form-foot">
        <span>{sentAt ? 'Queued for review' : `${remaining} left`}</span>
        <button disabled={props.disabled || text.trim().length < 2}>Send</button>
      </div>
    </form>
  );
}
