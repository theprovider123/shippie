import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import type { Story } from '../db/schema.ts';
import { listStories, deleteStory, renameStory } from '../db/queries.ts';

interface Props {
  db: ShippieLocalDb;
  onOpen: (storyId: string) => void;
  onShare: (storyId: string) => void;
  onPair: () => void;
  onSwitchToKid: () => void;
}

export function ParentHome({ db, onOpen, onShare, onPair, onSwitchToKid }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function refresh() {
    setStories(await listStories(db));
  }

  useEffect(() => { void refresh(); }, []);

  async function rename(id: string) {
    if (!draft.trim()) { setEditing(null); return; }
    await renameStory(db, id, draft.trim());
    setEditing(null);
    setDraft('');
    await refresh();
  }

  async function remove(id: string) {
    await deleteStory(db, id);
    await refresh();
  }

  return (
    <section className="ss-parent-home">
      <p className="ss-eyebrow">Parent view</p>
      <h2 className="ss-section-title">Stories made on this phone</h2>
      {stories.length === 0 ? (
        <p className="ss-empty">Nothing made yet.</p>
      ) : (
        <ul className="ss-parent-list">
          {stories.map((s) => (
            <li key={s.id} className="ss-parent-row">
              {editing === s.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void rename(s.id); }}
                    className="ss-input"
                  />
                  <button type="button" className="ss-btn ss-btn-primary" onClick={() => void rename(s.id)}>Save</button>
                  <button type="button" className="ss-btn ss-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="ss-parent-title" onClick={() => onOpen(s.id)}>
                    <strong>{s.title}</strong>
                    <span className="ss-parent-meta">
                      by {s.made_by} · {new Date(s.made_at).toLocaleDateString()}
                      {s.shared_at ? ` · shared` : ''}
                    </span>
                  </button>
                  <button type="button" className="ss-btn" onClick={() => { setEditing(s.id); setDraft(s.title); }}>Rename</button>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={() => onShare(s.id)}>Share</button>
                  <button type="button" className="ss-btn ss-btn-ghost" onClick={() => void remove(s.id)}>Delete</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="ss-section-title">Settings</h2>
      <div className="ss-parent-actions">
        <button type="button" className="ss-btn" onClick={onPair}>Manage paired family</button>
        <button type="button" className="ss-btn" onClick={onSwitchToKid}>Hand the phone over</button>
      </div>
    </section>
  );
}
