import { useEffect, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createGroup, joinGroup, type Group } from '@shippie/proximity';

const shippie = createShippieIframeSdk({ appId: 'app_show_and_tell' });

/**
 * P4C-2 — Show and Tell.
 *
 * A pure mesh-only ephemeral scratchpad. Anyone on the same room
 * code can drop short text, photos, or links. Items expire when
 * the room empties: when `group.members().length === 0` for 30+
 * seconds, we wipe the local list.
 *
 * Privacy contract: nothing persists across sessions. No
 * localStorage, no IndexedDB. The room code is the only identifier
 * and it's only useful while peers are connected.
 */

interface MeshItem {
  id: string;
  kind: 'text' | 'link';
  body: string;
  authorId: string;
  postedAt: number;
}

const EMPTY_ROOM_GRACE_MS = 30_000;

export function App() {
  const [items, setItems] = useState<MeshItem[]>([]);
  const [draft, setDraft] = useState('');
  const [meshState, setMeshState] = useState<'off' | 'connecting' | 'live'>('off');
  const [activeJoinCode, setActiveJoinCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const groupRef = useRef<Group | null>(null);
  const itemsRef = useRef(items);
  const emptySinceRef = useRef<number | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function applyMessage(message: unknown) {
    const m = message as Partial<MeshItem> | null;
    if (!m || typeof m.id !== 'string' || typeof m.body !== 'string') return;
    const fresh: MeshItem = {
      id: m.id,
      kind: m.kind === 'link' ? 'link' : 'text',
      body: m.body,
      authorId: typeof m.authorId === 'string' ? m.authorId : 'peer',
      postedAt: typeof m.postedAt === 'number' ? m.postedAt : Date.now(),
    };
    setItems((prev) =>
      prev.some((it) => it.id === fresh.id) ? prev : [fresh, ...prev].slice(0, 60),
    );
  }

  // Tick-based room-empty watcher. When the local member count drops
  // to 0 for the grace period, wipe everything.
  useEffect(() => {
    if (meshState !== 'live') return;
    const interval = window.setInterval(() => {
      const group = groupRef.current;
      if (!group) return;
      const live = group.members().length;
      setMemberCount(live);
      if (live === 0) {
        emptySinceRef.current ??= Date.now();
        if (Date.now() - (emptySinceRef.current ?? 0) > EMPTY_ROOM_GRACE_MS) {
          setItems([]);
        }
      } else {
        emptySinceRef.current = null;
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [meshState]);

  useEffect(() => {
    return () => {
      groupRef.current?.leave();
      groupRef.current = null;
    };
  }, []);

  async function startGroup() {
    setMeshState('connecting');
    setError(null);
    try {
      const group = await createGroup({ appSlug: 'show-and-tell' });
      groupRef.current = group;
      group.on('msg', applyMessage);
      setActiveJoinCode(group.joinCode);
      setMeshState('live');
      shippie.feel.texture('install');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start mesh.');
      setMeshState('off');
    }
  }

  async function join() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    setMeshState('connecting');
    setError(null);
    try {
      const group = await joinGroup({ appSlug: 'show-and-tell', joinCode: code });
      groupRef.current = group;
      group.on('msg', applyMessage);
      setActiveJoinCode(group.joinCode);
      setMeshState('live');
      shippie.feel.texture('install');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
      setMeshState('off');
    }
  }

  function leave() {
    groupRef.current?.leave();
    groupRef.current = null;
    setActiveJoinCode(null);
    setMeshState('off');
    setItems([]);
  }

  function post() {
    const body = draft.trim();
    if (!body || !groupRef.current) return;
    const item: MeshItem = {
      id: `m_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      kind: looksLikeUrl(body) ? 'link' : 'text',
      body,
      authorId: groupRef.current.selfId,
      postedAt: Date.now(),
    };
    setItems((prev) => [item, ...prev].slice(0, 60));
    void groupRef.current.broadcast('msg', item);
    setDraft('');
    shippie.feel.texture('confirm');
  }

  return (
    <main>
      <header>
        <h1>Show & Tell</h1>
        <p>Ephemeral mesh scratchpad. Nothing persists; everything clears when the room empties.</p>
      </header>

      <section className="mesh">
        {meshState === 'live' && activeJoinCode ? (
          <div className="mesh-live">
            <strong>Room {activeJoinCode}</strong>
            <span>{memberCount + 1} on the mesh</span>
            <button className="ghost" onClick={leave}>
              Leave
            </button>
          </div>
        ) : (
          <div className="mesh-controls">
            <button onClick={startGroup} disabled={meshState === 'connecting'}>
              {meshState === 'connecting' ? 'Connecting…' : 'Start a room'}
            </button>
            <span>or</span>
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Join code"
              maxLength={8}
              aria-label="Join code"
            />
            <button onClick={join} disabled={!joinCodeInput || meshState === 'connecting'}>
              Join
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="compose">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={meshState === 'live' ? 'Drop a thought, link, or quote' : 'Start or join a room first'}
          disabled={meshState !== 'live'}
          onKeyDown={(e) => e.key === 'Enter' && post()}
          aria-label="Post text"
        />
        <button onClick={post} disabled={meshState !== 'live' || !draft.trim()}>
          Post
        </button>
      </section>

      <section className="feed" aria-label="Mesh feed">
        {items.length === 0 ? (
          <p className="empty">
            Nothing here. {meshState === 'live' ? 'Drop something — everyone in the room sees it.' : 'Start a room and share the code.'}
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className={`item-${item.kind}`}>
                <small>{new Date(item.postedAt).toLocaleTimeString()}</small>
                {item.kind === 'link' ? (
                  <a href={item.body} target="_blank" rel="noopener noreferrer">
                    {item.body}
                  </a>
                ) : (
                  <p>{item.body}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
