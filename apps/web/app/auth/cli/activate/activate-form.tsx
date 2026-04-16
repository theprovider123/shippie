'use client';

import { useState } from 'react';

export function ActivateForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'approved'; clientName: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/auth/cli/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: code.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        client_name?: string;
        error?: string;
      };
      if (res.ok && body.ok && body.client_name) {
        setState({ kind: 'approved', clientName: body.client_name });
        return;
      }
      setState({
        kind: 'error',
        message: body.error ?? `Approval failed (${res.status})`,
      });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }

  if (state.kind === 'approved') {
    return (
      <div
        style={{
          border: '1px solid var(--sage-leaf)',
          borderRadius: 8,
          padding: 'var(--space-xl)',
          background: 'var(--surface)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--h3-size)', color: 'var(--sage-leaf)' }}>
          ✓ Device connected
        </p>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)', lineHeight: 1.6 }}>
          <code style={{ fontFamily: 'var(--font-mono)' }}>{state.clientName}</code> can now deploy on your behalf.
          Return to your terminal — it should have finished polling and saved the token.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--caption-size)',
            color: 'var(--text-light)',
            marginTop: 'var(--space-lg)',
          }}
        >
          Revoke anytime from the dashboard.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--caption-size)',
            color: 'var(--text-light)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          User code
        </span>
        <input
          name="user_code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="BCDF-GHJK"
          required
          autoComplete="off"
          spellCheck={false}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(1.125rem, 2vw, 1.5rem)',
            letterSpacing: '0.08em',
            padding: 'var(--space-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            borderRadius: 4,
          }}
        />
      </label>

      <button
        type="submit"
        disabled={state.kind === 'submitting' || !code.trim()}
        className="btn-primary"
        style={{ justifyContent: 'center' }}
      >
        {state.kind === 'submitting' ? 'Connecting…' : 'Authorize device'}
      </button>

      {state.kind === 'error' && (
        <p style={{ color: 'var(--sunset-dim)', fontSize: 'var(--small-size)' }}>
          {formatError(state.message)}
        </p>
      )}
    </form>
  );
}

function formatError(raw: string): string {
  switch (raw) {
    case 'invalid_code':
      return 'That code is not valid. Double-check the CLI output.';
    case 'already_used':
      return 'That code has already been used. Start a new `shippie login`.';
    case 'expired':
      return 'That code expired. Start a new `shippie login`.';
    case 'already_bound_to_other_user':
      return 'That code was approved by a different account already.';
    case 'missing_user_code':
      return 'Paste the user code from your CLI output.';
    default:
      return raw;
  }
}
