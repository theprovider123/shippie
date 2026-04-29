import { useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createGroup, joinGroup, type Group } from '@shippie/proximity';
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

/**
 * P3 — wire the existing list to:
 *   - `pantry-low` (Pantry Scanner provides) → auto-add items.
 *   - `needs-restocking` (this app provides) → broadcast on add so
 *     other apps can react when the user runs out of something.
 *   - Multi-phone mesh sync via `@shippie/proximity` Group. The Group
 *     API uses the platform's signal DO at `/__shippie/signal`, so no
 *     extra config is needed beyond starting/joining a group.
 */

interface MeshEvent {
  kind: 'add' | 'toggle' | 'remove' | 'snapshot';
  item?: ListItem;
  itemId?: string;
  items?: ListItem[];
}

export function App() {
  const [items, setItems] = useState<ListItem[]>(() => load());
  const [draft, setDraft] = useState('');
  const [meshHint, setMeshHint] = useState<string | null>(null);
  const [meshState, setMeshState] = useState<'off' | 'connecting' | 'live'>('off');
  const [joinCode, setJoinCode] = useState('');
  const [activeJoinCode, setActiveJoinCode] = useState<string | null>(null);
  const groupRef = useRef<Group | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // shopping-list (Meal Planner) → bulk-add planned items.
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

  // P3 — pantry-low (Pantry Scanner) auto-adds items. We only add
  // when the item isn't already on the list.
  useEffect(() => {
    shippie.requestIntent('pantry-low');
    return shippie.intent.subscribe('pantry-low', ({ rows }) => {
      const additions: { name: string }[] = [];
      for (const row of rows as Array<{ name?: unknown }>) {
        if (typeof row?.name === 'string' && row.name.trim()) {
          additions.push({ name: row.name.trim() });
        }
      }
      if (additions.length === 0) return;
      setItems((prev) => {
        const byName = new Set(prev.map((i) => i.name.toLowerCase()));
        const fresh: ListItem[] = additions
          .filter((a) => !byName.has(a.name.toLowerCase()))
          .map((a, i) => ({
            id: `i_${Date.now()}_${i}`,
            name: a.name,
            checked: false,
            source: 'pantry-low' as const,
            addedAt: new Date().toISOString(),
          }));
        if (fresh.length === 0) return prev;
        shippie.feel.texture('install');
        return [...fresh, ...prev];
      });
    });
  }, []);

  // P3 — apply mesh events. The local state machine is identical to
  // user-driven mutations; we just don't echo back to avoid loops.
  function applyMeshEvent(event: MeshEvent) {
    if (event.kind === 'add' && event.item) {
      const item = event.item;
      setItems((prev) =>
        prev.some((i) => i.id === item.id) ? prev : [{ ...item, source: 'mesh' as const }, ...prev],
      );
    } else if (event.kind === 'toggle' && event.itemId) {
      const id = event.itemId;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
    } else if (event.kind === 'remove' && event.itemId) {
      const id = event.itemId;
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else if (event.kind === 'snapshot' && Array.isArray(event.items)) {
      // Coalesce — keep local state for ids the snapshot doesn't carry,
      // adopt the snapshot for everything else.
      const incoming = event.items;
      setItems((prev) => {
        const byId = new Map<string, ListItem>(
          incoming.map((it) => [it.id, { ...it, source: 'mesh' }]),
        );
        for (const it of prev) if (!byId.has(it.id)) byId.set(it.id, it);
        return [...byId.values()];
      });
    }
  }

  async function startGroup() {
    setMeshState('connecting');
    try {
      const group = await createGroup({ appSlug: 'shopping-list' });
      groupRef.current = group;
      group.on('list', (data) => applyMeshEvent(data as MeshEvent));
      // Send an initial snapshot so a peer joining mid-shop catches up.
      void group.broadcast('list', { kind: 'snapshot', items: itemsRef.current });
      setActiveJoinCode(group.joinCode);
      setMeshState('live');
      shippie.feel.texture('install');
    } catch (err) {
      setMeshState('off');
      setMeshHint(err instanceof Error ? err.message : 'Could not start mesh.');
    }
  }

  async function joinExisting() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setMeshState('connecting');
    try {
      const group = await joinGroup({ appSlug: 'shopping-list', joinCode: code });
      groupRef.current = group;
      group.on('list', (data) => applyMeshEvent(data as MeshEvent));
      setActiveJoinCode(group.joinCode);
      setMeshState('live');
      shippie.feel.texture('install');
    } catch (err) {
      setMeshState('off');
      setMeshHint(err instanceof Error ? err.message : 'Could not join.');
    }
  }

  function leaveMesh() {
    groupRef.current?.leave();
    groupRef.current = null;
    setActiveJoinCode(null);
    setMeshState('off');
  }

  // Ensure we cut the mesh when the iframe unmounts.
  useEffect(() => {
    return () => {
      groupRef.current?.leave();
      groupRef.current = null;
    };
  }, []);

  function broadcast(event: MeshEvent) {
    void groupRef.current?.broadcast('list', event);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const item: ListItem = {
      id: `i_${Date.now()}`,
      name,
      checked: false,
      source: 'manual',
      addedAt: new Date().toISOString(),
    };
    setItems((prev) => [item, ...prev]);
    setDraft('');
    broadcast({ kind: 'add', item });
    // P3 — needs-restocking broadcast: any new item on the list is a
    // signal to other apps that the user needs more of it.
    shippie.intent.broadcast('needs-restocking', [{ name: item.name }]);
    shippie.feel.texture('confirm');
  }

  function toggle(id: string) {
    const before = items.find((i) => i.id === id);
    if (!before) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
    broadcast({ kind: 'toggle', itemId: id });
    shippie.feel.texture('toggle');
  }

  function clearChecked() {
    const removed = items.filter((i) => i.checked);
    setItems((prev) => prev.filter((i) => !i.checked));
    for (const it of removed) broadcast({ kind: 'remove', itemId: it.id });
    if (removed.length > 0) shippie.feel.texture('delete');
  }

  const remaining = items.filter((i) => !i.checked).length;

  return (
    <main>
      <header>
        <h1>Shopping</h1>
        <p>{remaining} of {items.length} still to get</p>
      </header>

      <section className="mesh" aria-label="Local mesh sharing">
        <h2>Local mesh</h2>
        {meshState === 'live' && activeJoinCode ? (
          <div className="mesh-live">
            <strong>Live</strong>
            <code>{activeJoinCode}</code>
            <button className="ghost" onClick={leaveMesh}>
              Leave
            </button>
          </div>
        ) : (
          <div className="mesh-controls">
            <button onClick={startGroup} disabled={meshState === 'connecting'}>
              {meshState === 'connecting' ? 'Connecting…' : 'Start session'}
            </button>
            <span>or</span>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Join code"
              maxLength={8}
              aria-label="Join code"
            />
            <button onClick={joinExisting} disabled={!joinCode || meshState === 'connecting'}>
              Join
            </button>
          </div>
        )}
        {meshState === 'live' && (
          <p className="mesh-hint">Changes here sync to every phone using this code.</p>
        )}
      </section>

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
      </div>
      {meshHint && <p className="mesh-hint">{meshHint}</p>}
    </main>
  );
}
