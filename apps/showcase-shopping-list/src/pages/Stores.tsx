/**
 * Stores page — pick the active store, drag-reorder its aisle path,
 * or add a custom store.
 *
 * Drag-reorder: we use HTML5 native drag-and-drop. It's not the
 * prettiest interaction on touch (Safari iOS only fires it on
 * long-press) but it ships without bringing in a DnD lib. For
 * keyboard a11y we also expose ↑/↓ buttons on each aisle row.
 */
import { useState } from 'react';
import type { StoreProfile } from '../lib/types.ts';
import type { Aisle } from '../AisleClassifier.tsx';
import { aisleLabel } from '../AisleClassifier.tsx';
import { fullAislePath, reorderAisles, upsertProfile } from '../lib/store-profiles.ts';

interface StoresPageProps {
  profiles: readonly StoreProfile[];
  activeId: string;
  onActive: (id: string) => void;
  onProfilesChange: (profiles: readonly StoreProfile[]) => void;
  onBack: () => void;
}

export function StoresPage({ profiles, activeId, onActive, onProfilesChange, onBack }: StoresPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingProfile = profiles.find((p) => p.id === editingId) ?? null;
  const [newName, setNewName] = useState('');

  function handleReorder(profile: StoreProfile, from: number, to: number) {
    const next = reorderAisles(profile, from, to);
    onProfilesChange(upsertProfile(profiles, next));
  }

  function addCustomStore() {
    const name = newName.trim();
    if (!name) return;
    const id = `custom-${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now().toString(36)}`;
    const generic = profiles.find((p) => p.id === 'generic');
    const profile: StoreProfile = {
      id,
      name,
      aislePath: generic ? generic.aislePath : [],
    };
    onProfilesChange(upsertProfile(profiles, profile));
    setNewName('');
    setEditingId(id);
  }

  return (
    <main>
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack} aria-label="Back to list">
          ← Back
        </button>
        <h1>Stores</h1>
      </header>

      <ul className="store-list">
        {profiles.map((p) => (
          <li key={p.id} className={p.id === activeId ? 'active' : ''}>
            <button
              type="button"
              className="store-pick"
              onClick={() => onActive(p.id)}
              aria-pressed={p.id === activeId}
            >
              <span className="dot" aria-hidden>{p.id === activeId ? '●' : '○'}</span>
              <span className="store-name">{p.name}</span>
              <span className="store-meta">{p.aislePath.length} aisles</span>
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setEditingId(editingId === p.id ? null : p.id)}
              aria-expanded={editingId === p.id}
            >
              {editingId === p.id ? 'Close' : 'Edit'}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="add-store"
        onSubmit={(e) => {
          e.preventDefault();
          addCustomStore();
        }}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add another store"
          aria-label="New store name"
        />
        <button type="submit">Add</button>
      </form>

      {editingProfile && (
        <AisleEditor
          profile={editingProfile}
          onMove={(from, to) => handleReorder(editingProfile, from, to)}
        />
      )}
    </main>
  );
}

interface AisleEditorProps {
  profile: StoreProfile;
  onMove: (from: number, to: number) => void;
}

function AisleEditor({ profile, onMove }: AisleEditorProps) {
  const path = fullAislePath(profile);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  return (
    <section className="aisle-editor">
      <h2>{profile.name} — walk path</h2>
      <p className="hint">First aisle on top is where you start in the store.</p>
      <ol>
        {path.map((aisle, idx) => (
          <li
            key={aisle}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null && dragIdx !== idx) onMove(dragIdx, idx);
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
            className={dragIdx === idx ? 'dragging' : ''}
          >
            <span className="aisle-handle" aria-hidden>⠿</span>
            <span className="aisle-name">{aisleLabel(aisle as Aisle)}</span>
            <button
              type="button"
              className="ghost compact"
              onClick={() => idx > 0 && onMove(idx, idx - 1)}
              disabled={idx === 0}
              aria-label={`Move ${aisle} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="ghost compact"
              onClick={() => idx < path.length - 1 && onMove(idx, idx + 1)}
              disabled={idx === path.length - 1}
              aria-label={`Move ${aisle} down`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
