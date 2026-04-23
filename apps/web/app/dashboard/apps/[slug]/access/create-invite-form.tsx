'use client';

import { useState } from 'react';

const fieldStyle: React.CSSProperties = {
  height: 40,
  padding: '0 0.75rem',
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  width: 140,
};

export function CreateInviteForm({ slug }: { slug: string }) {
  const [maxUses, setMaxUses] = useState('');
  const [expiresDays, setExpiresDays] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    const body: Record<string, unknown> = { kind: 'link' };
    if (maxUses) body.max_uses = Number(maxUses);
    if (expiresDays) {
      const d = new Date();
      d.setDate(d.getDate() + Number(expiresDays));
      body.expires_at = d.toISOString();
    }
    const res = await fetch(`/api/apps/${slug}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (j.url) {
      setUrl(j.url);
      setMaxUses('');
      setExpiresDays('');
    } else {
      setError(j.error ?? 'Failed');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-md)',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Max uses (optional)</span>
        <input
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="unlimited"
          style={fieldStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Expires in (days)</span>
        <input
          value={expiresDays}
          onChange={(e) => setExpiresDays(e.target.value)}
          placeholder="never"
          style={fieldStyle}
        />
      </label>
      <button onClick={submit} className="btn-primary" style={{ height: 40 }}>
        Create link
      </button>
      {url && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--sunset)' }}>
          {url}
        </p>
      )}
      {error && <p style={{ color: '#c84a2a' }}>{error}</p>}
    </div>
  );
}
