'use client';

import { useState } from 'react';

interface AppData {
  id: string;
  slug: string;
  name: string;
  type: string;
  visibilityScope: string;
  isArchived: boolean;
  takedownReason: string | null;
}

export function AdminAppRow({ app }: { app: AppData }) {
  const [archived, setArchived] = useState(app.isArchived);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const newState = !archived;
    const reason = newState
      ? prompt('Takedown reason (required):')
      : null;

    if (newState && !reason) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          is_archived: newState,
          takedown_reason: reason,
        }),
      });
      if (res.ok) setArchived(newState);
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-900">
      <td className="py-2 font-mono">{app.slug}</td>
      <td className="py-2">{app.name}</td>
      <td className="py-2 text-xs">{app.type}</td>
      <td className="py-2 text-xs">{app.visibilityScope}</td>
      <td className="py-2">
        {archived ? (
          <span className="text-red-600 text-xs font-bold">Archived</span>
        ) : (
          <span className="text-green-600 text-xs">Active</span>
        )}
      </td>
      <td className="py-2">
        <button
          onClick={toggle}
          disabled={loading}
          className="text-xs px-3 py-1 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? '…' : archived ? 'Restore' : 'Archive'}
        </button>
      </td>
    </tr>
  );
}
