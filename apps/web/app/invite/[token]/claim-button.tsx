// apps/web/app/invite/[token]/claim-button.tsx
'use client';
import { useState } from 'react';

export function ClaimButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'claiming' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function onClick() {
    setState('claiming');
    const res = await fetch(`/api/invite/${encodeURIComponent(token)}/claim`, {
      method: 'POST',
    });
    const j = (await res.json().catch(() => ({}))) as {
      redirect_to?: string;
      reason?: string;
      error?: string;
    };
    if (res.ok && j.redirect_to) {
      window.location.href = j.redirect_to;
      return;
    }
    setState('error');
    setMsg(j.reason ?? j.error ?? 'Claim failed.');
  }

  return (
    <>
      <button
        onClick={onClick}
        className="btn-primary"
        disabled={state === 'claiming'}
        style={{ justifyContent: 'center', height: 48 }}
      >
        {state === 'claiming' ? 'Claiming…' : 'Accept invite →'}
      </button>
      {state === 'error' && (
        <p style={{ color: '#c84a2a', fontSize: 'var(--small-size)' }}>{msg}</p>
      )}
    </>
  );
}
