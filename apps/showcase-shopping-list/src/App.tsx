import { useEffect, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { mergeIncoming, type ListItem } from './merge.ts';

const shippie = createShippieIframeSdk({ appId: 'app_shopping_list' });

const STORAGE_KEY = 'shippie.shopping-list.v1';

function load(): ListItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ListItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function App() {
  const [items, setItems] = useState<ListItem[]>(() => load());
  const [draft, setDraft] = useState('');
  const [meshHint, setMeshHint] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Subscribe to shopping-list broadcasts. Request the intent once on
  // mount; the container's permission prompt only fires the first time.
  useEffect(() => {
    shippie.requestIntent('shopping-list');
    return shippie.intent.subscribe('shopping-list', ({ rows }) => {
      const items = rows
        .map((r) => {
          const candidate = r ?? {};
          if (candidate && typeof candidate === 'object' && 'name' in candidate) {
            const name = (candidate as { name?: unknown }).name;
            return typeof name === 'string' ? { name } : null;
          }
          return null;
        })
        .filter((x): x is { name: string } => x !== null);
      if (items.length === 0) return;
      setItems((prev) => mergeIncoming(prev, items, Date.now()));
    });
  }, []);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setItems((prev) => [
      {
        id: `i_${Date.now()}`,
        name,
        checked: false,
        source: 'manual',
        addedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft('');
  }

  function toggle(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  }

  function clearChecked() {
    setItems((prev) => prev.filter((i) => !i.checked));
  }

  function shareToMesh() {
    shippie.feel.texture('install');
    setMeshHint('Asked the container to share over the local mesh.');
    setTimeout(() => setMeshHint(null), 4000);
  }

  const remaining = items.filter((i) => !i.checked).length;

  return (
    <main>
      <header>
        <h1>Shopping</h1>
        <p>{remaining} of {items.length} still to get</p>
      </header>

      <form onSubmit={add}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item"
          aria-label="New item"
        />
        <button type="submit">Add</button>
      </form>

      {items.length === 0 ? (
        <p className="empty">When the meal planner shares its shopping list, items show up here automatically.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id} className={it.checked ? 'done' : ''}>
              <button onClick={() => toggle(it.id)} aria-pressed={it.checked} aria-label={`Toggle ${it.name}`}>
                <span className="box">{it.checked ? '✓' : ''}</span>
                <span className="name">{it.name}</span>
                <span className="src" data-src={it.source}>{it.source}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button className="ghost" onClick={clearChecked} disabled={items.every((i) => !i.checked)}>
          Clear checked
        </button>
        <button className="ghost share" onClick={shareToMesh} disabled={items.length === 0}>
          Share over local mesh
        </button>
      </div>
      {meshHint && <p className="mesh-hint">{meshHint}</p>}
    </main>
  );
}
