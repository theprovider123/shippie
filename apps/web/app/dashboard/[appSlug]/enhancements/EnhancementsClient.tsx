'use client';

import { useState, useTransition } from 'react';
import { saveShippieJson, resetShippieJson } from './actions';

interface Props {
  slug: string;
  initialJson: Record<string, unknown> | null;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; msg: string };

export function EnhancementsClient({ slug, initialJson }: Props) {
  const [text, setText] = useState(() => JSON.stringify(initialJson ?? {}, null, 2));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    setStatus({ kind: 'saving' });
    startTransition(async () => {
      const result = await saveShippieJson(slug, text);
      if ('error' in result) setStatus({ kind: 'error', msg: result.error });
      else setStatus({ kind: 'saved' });
    });
  };

  const onReset = () => {
    if (
      !confirm(
        'Reset to auto-detected enhancements? This clears your shippie.json overrides.',
      )
    )
      return;
    startTransition(async () => {
      await resetShippieJson(slug);
      setText('{}');
      setStatus({ kind: 'saved' });
    });
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>shippie.json</h2>
      <p style={{ margin: '0 0 12px', color: '#5C5751', fontSize: 14 }}>
        Override anything Shippie auto-detected. Saves apply on the next deploy.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus({ kind: 'idle' });
        }}
        rows={14}
        spellCheck={false}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          padding: 12,
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 8,
          background: '#FCFAF5',
        }}
      />
      {status.kind === 'error' ? (
        <p style={{ color: '#B23A2B', margin: '8px 0 0', fontSize: 14 }}>{status.msg}</p>
      ) : null}
      {status.kind === 'saved' ? (
        <p style={{ color: '#2c9b56', margin: '8px 0 0', fontSize: 14 }}>
          Saved. Next deploy uses the new config.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: 'none',
            background: '#E8603C',
            color: 'white',
            fontWeight: 500,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending && status.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onReset}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: '1px solid rgba(0,0,0,0.2)',
            background: 'transparent',
            color: '#14120F',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          Reset to auto
        </button>
      </div>
    </section>
  );
}
