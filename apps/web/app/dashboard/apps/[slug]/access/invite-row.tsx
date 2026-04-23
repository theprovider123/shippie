'use client';

import { useState } from 'react';

export interface InviteRowShape {
  id: string;
  token: string;
  kind: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | string | null;
}

export function InviteRow({ invite, slug }: { invite: InviteRowShape; slug: string }) {
  const [revoked, setRevoked] = useState(false);

  async function revoke() {
    const res = await fetch(`/api/apps/${slug}/invites/${invite.id}`, { method: 'DELETE' });
    if (res.ok) setRevoked(true);
  }

  if (revoked) return null;

  const host = typeof window !== 'undefined' ? window.location.host : 'shippie.app';
  const scheme = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  const url = `${scheme}//${host}/invite/${invite.token}`;
  const uses = invite.maxUses == null ? 'unlimited' : `${invite.maxUses - invite.usedCount} left`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-sm)',
        border: '1px solid var(--border-light)',
        flexWrap: 'wrap',
      }}
    >
      <code style={{ fontSize: 13, flex: 1, minWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {url}
      </code>
      <span style={{ fontSize: 12, color: 'var(--text-light)', fontFamily: 'var(--font-mono)' }}>
        {uses}
      </span>
      <button
        onClick={() => void navigator.clipboard.writeText(url)}
        className="btn-secondary"
        style={{ height: 32, padding: '0 0.75rem', fontSize: 13 }}
      >
        Copy
      </button>
      <button
        onClick={revoke}
        className="btn-secondary"
        style={{ height: 32, padding: '0 0.75rem', fontSize: 13 }}
      >
        Revoke
      </button>
    </div>
  );
}
