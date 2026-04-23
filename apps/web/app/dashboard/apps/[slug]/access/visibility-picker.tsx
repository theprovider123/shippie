'use client';

import { useState } from 'react';

type Scope = 'public' | 'unlisted' | 'private';

const OPTIONS: Array<{ value: Scope; label: string; blurb: string }> = [
  {
    value: 'public',
    label: 'Public',
    blurb: 'Everyone can find it on /apps and /leaderboards.',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    blurb: 'Anyone with the URL can see it. Not listed publicly.',
  },
  {
    value: 'private',
    label: 'Private',
    blurb: 'Invitees only. Hidden from /apps, /leaderboards, search.',
  },
];

export function VisibilityPicker({ slug, initial }: { slug: string; initial: Scope }) {
  const [scope, setScope] = useState<Scope>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function onChange(next: Scope) {
    setScope(next);
    setError('');
    setSaving(true);
    const res = await fetch(`/api/apps/${slug}/visibility`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility_scope: next }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? 'Save failed');
      setScope(initial);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      {OPTIONS.map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            gap: 'var(--space-sm)',
            alignItems: 'flex-start',
            padding: 'var(--space-sm)',
            border: '1px solid var(--border-light)',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="radio"
            name="visibility"
            value={opt.value}
            checked={scope === opt.value}
            disabled={saving}
            onChange={() => onChange(opt.value)}
            style={{ marginTop: 4 }}
          />
          <div>
            <strong>{opt.label}</strong>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{opt.blurb}</p>
          </div>
        </label>
      ))}
      {error && <p style={{ color: '#c84a2a', fontSize: 13 }}>{error}</p>}
    </div>
  );
}
