import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ARCADE_GAMES,
  ARCADE_LANES,
  childRuntimeSrc,
  gameById,
  gamesForLane,
  neighborGameId,
  normalizeGameId,
  type ArcadeGame,
} from './games';
import { fetchRoster, resolveVisibleIds, type RosterState } from './roster';

const MEMORY_KEY = 'shippie:arcade:v1';
const OUTER_APP_ID = 'app_arcade';

interface GameMemory {
  opens: number;
  completions: number;
  lastAt: string | null;
  lastResult: string | number | null;
}

interface ArcadeMemory {
  selectedGame: string;
  games: Record<string, GameMemory>;
}

const emptyGameMemory = (): GameMemory => ({
  opens: 0,
  completions: 0,
  lastAt: null,
  lastResult: null,
});

function readInitialGame(): string {
  if (typeof window === 'undefined') return normalizeGameId(null);
  const url = new URL(window.location.href);
  return normalizeGameId(url.searchParams.get('game') ?? url.hash.replace(/^#game=/, ''));
}

function readMemory(): ArcadeMemory {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(MEMORY_KEY);
    if (!raw) return { selectedGame: readInitialGame(), games: {} };
    const parsed = JSON.parse(raw) as Partial<ArcadeMemory>;
    return {
      selectedGame: normalizeGameId(parsed.selectedGame ?? readInitialGame()),
      games: parsed.games && typeof parsed.games === 'object' ? parsed.games : {},
    };
  } catch {
    return { selectedGame: readInitialGame(), games: {} };
  }
}

function writeMemory(memory: ArcadeMemory) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* storage can be blocked */
  }
}

function updateUrlGame(gameId: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('game', gameId);
  url.hash = '';
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function cssVars(game: ArcadeGame): CSSProperties {
  return {
    '--accent': game.accent,
  } as CSSProperties;
}

function bridgePayloadForOuterHost(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  if (record.protocol !== 'shippie.bridge.v1') return data;
  return { ...record, appId: OUTER_APP_ID };
}

function declareArcadeInputRegion() {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(
    {
      protocol: 'shippie.bridge.v1',
      appId: OUTER_APP_ID,
      capability: 'safe-edges',
      method: 'declareInputRegion',
      payload: { owns: 'all' },
    },
    window.location.origin,
  );
}

function completedRowsFromBridgePayload(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  if (record.protocol !== 'shippie.bridge.v1') return [];
  if (record.capability !== 'intent.provide' || record.method !== 'broadcast') return [];
  const payload = record.payload as { intent?: unknown; rows?: unknown } | null;
  if (!payload || payload.intent !== 'game.completed' || !Array.isArray(payload.rows)) return [];
  return payload.rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
}

export function App() {
  const [memory, setMemory] = useState<ArcadeMemory>(() => readMemory());
  const [selectedId, setSelectedId] = useState(() => normalizeGameId(memory.selectedGame));
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [roster, setRoster] = useState<RosterState>({ kind: 'cold', enabled: [], blocked: [] });
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const selected = gameById(selectedId) ?? ARCADE_GAMES[0]!;
  const selectedStats = memory.games[selected.id] ?? emptyGameMemory();
  const childSrc = useMemo(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    return childRuntimeSrc(selected.id, search);
  }, [selected.id]);

  const bakedIds = useMemo(() => ARCADE_GAMES.map((g) => g.id), []);
  const visibleIds = useMemo(() => new Set(resolveVisibleIds(bakedIds, roster)), [bakedIds, roster]);

  function patchMemory(updater: (previous: ArcadeMemory) => ArcadeMemory) {
    setMemory((previous) => {
      const next = updater(previous);
      writeMemory(next);
      return next;
    });
  }

  function selectGame(gameId: string) {
    const normalized = normalizeGameId(gameId);
    setSelectedId(normalized);
    setLoadedId(null);
    updateUrlGame(normalized);
    patchMemory((previous) => ({
      selectedGame: normalized,
      games: {
        ...previous.games,
        [normalized]: {
          ...(previous.games[normalized] ?? emptyGameMemory()),
          opens: (previous.games[normalized]?.opens ?? 0) + 1,
          lastAt: new Date().toISOString(),
        },
      },
    }));
  }

  async function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    if (typeof document === 'undefined') return;

    if (!next) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    const target = frameRef.current ?? screenRef.current;
    await target?.requestFullscreen?.().catch(() => undefined);
  }

  useEffect(() => {
    let active = true;
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const load = () => { void fetchRoster(origin).then((r) => { if (active) setRoster(r); }); };
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { active = false; document.removeEventListener('visibilitychange', onVis); };
  }, []);

  useEffect(() => {
    declareArcadeInputRegion();
    const retryTimers = [120, 420, 900].map((delay) => window.setTimeout(declareArcadeInputRegion, delay));
    patchMemory((previous) => {
      const current = previous.games[selectedId] ?? emptyGameMemory();
      if (current.opens > 0) return { ...previous, selectedGame: selectedId };
      return {
        selectedGame: selectedId,
        games: {
          ...previous.games,
          [selectedId]: {
            ...current,
            opens: 1,
            lastAt: new Date().toISOString(),
          },
        },
      };
    });
    updateUrlGame(selectedId);
    return () => retryTimers.forEach((timer) => window.clearTimeout(timer));
    // Run once for the first selected game only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectGame(neighborGameId(selectedId, -1));
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectGame(neighborGameId(selectedId, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow) return;

      if (event.source === frameWindow) {
        const completedRows = completedRowsFromBridgePayload(event.data);
        if (completedRows.length > 0) {
          patchMemory((previous) => {
            const nextGames = { ...previous.games };
            for (const row of completedRows) {
              const gameId = normalizeGameId(typeof row.game === 'string' ? row.game : selectedId);
              const existing = nextGames[gameId] ?? emptyGameMemory();
              nextGames[gameId] = {
                ...existing,
                completions: existing.completions + 1,
                lastAt: typeof row.at === 'string' ? row.at : new Date().toISOString(),
                lastResult: typeof row.result === 'string' || typeof row.result === 'number' ? row.result : existing.lastResult,
              };
            }
            return { ...previous, games: nextGames };
          });
        }
        window.parent.postMessage(bridgePayloadForOuterHost(event.data), window.location.origin);
        return;
      }

      if (event.source === window.parent && event.origin === window.location.origin) {
        frameWindow.postMessage(event.data, window.location.origin);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [selectedId]);

  const selectedHidden = !visibleIds.has(selected.id) && roster.kind !== 'cold';
  useEffect(() => {
    if (selectedHidden) {
      const firstVisible = ARCADE_GAMES.find((g) => visibleIds.has(g.id));
      if (firstVisible && firstVisible.id !== selected.id) selectGame(firstVisible.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHidden]);

  const totalCompletions = Object.values(memory.games).reduce((sum, game) => sum + game.completions, 0);
  const playedCount = Object.values(memory.games).filter((game) => game.opens > 0).length;

  return (
    <div className="arcade-shell" data-focus-mode={focusMode ? 'true' : 'false'} style={cssVars(selected)}>
      <header className="marquee" aria-label="Arcade">
        <div>
          <p className="eyebrow">Shippie</p>
          <h1>Arcade</h1>
        </div>
        <div className="marquee-meter" aria-label="Arcade session summary">
          <span className="free-play">Free play</span>
          <span>{playedCount}/{ARCADE_GAMES.length} cabinets lit</span>
          <span>{totalCompletions} clears</span>
        </div>
      </header>

      <main className="machine">
        <nav className="game-rail" aria-label="Games">
          {ARCADE_LANES.map((lane) => {
            const games = gamesForLane(lane.id).filter((g) => visibleIds.has(g.id));
            if (games.length === 0) return null;
            return (
              <section className="lane" key={lane.id} aria-label={lane.title}>
                <div className="lane-head">
                  <strong>{lane.title}</strong>
                  <span>{lane.subtitle}</span>
                </div>
                <div className="lane-list">
                  {games.map((game) => {
                    const active = game.id === selected.id;
                    const stats = memory.games[game.id];
                    return (
                      <button
                        key={game.id}
                        className="game-pick"
                        data-active={active ? 'true' : 'false'}
                        type="button"
                        onClick={() => selectGame(game.id)}
                        style={cssVars(game)}
                        aria-current={active ? 'true' : undefined}
                      >
                        <span className="pick-mark" aria-hidden="true">{game.initials}</span>
                        <span className="pick-copy">
                          <strong>{game.name}</strong>
                          <small>{stats?.completions ? `${stats.completions} clear${stats.completions === 1 ? '' : 's'}` : game.loop}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>

        <section className="cabinet" aria-label={`${selected.name} game cabinet`}>
          <div className="cabinet-top">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous game"
              onClick={() => selectGame(neighborGameId(selected.id, -1))}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="selected-title">
              <p>{selected.loop} / {selected.tempo}</p>
              <h2>{selected.name}</h2>
              {selectedHidden && <p className="cabinet-note">that one isn&apos;t in the cabinet right now</p>}
            </div>
            <button
              className="icon-button fullscreen-button"
              type="button"
              aria-label={focusMode ? 'Exit fullscreen' : 'Fullscreen'}
              aria-pressed={focusMode}
              onClick={toggleFocusMode}
            >
              <span className="fullscreen-mark" aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Next game"
              onClick={() => selectGame(neighborGameId(selected.id, 1))}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <div className="screen-bezel" ref={screenRef}>
            <div className="screen-status" data-loaded={loadedId === selected.id ? 'true' : 'false'}>
              <span>{loadedId === selected.id ? 'Ready' : 'Booting'}</span>
            </div>
            <iframe
              key={selected.id}
              ref={frameRef}
              title={selected.name}
              src={childSrc}
              allow="clipboard-read; clipboard-write; fullscreen"
              onLoad={() => {
                setLoadedId(selected.id);
                declareArcadeInputRegion();
              }}
            />
          </div>

          <div className="cabinet-controls" aria-label="Current game details">
            <span>{selected.controls}</span>
            <span>{selected.description}</span>
          </div>
        </section>

        <aside className="session-panel" aria-label="Arcade session">
          <div className="session-block">
            <p className="panel-label">Now Playing</p>
            <strong>{selected.shortName}</strong>
            <span>{selected.description}</span>
          </div>
          <div className="session-grid">
            <div>
              <span>Plays</span>
              <strong>{selectedStats.opens}</strong>
            </div>
            <div>
              <span>Clears</span>
              <strong>{selectedStats.completions}</strong>
            </div>
            <div>
              <span>Last</span>
              <strong>{selectedStats.lastResult ?? '—'}</strong>
            </div>
          </div>
          <p className="panel-label">Quick slots</p>
          <ol className="quick-list" aria-label="Quick switch">
            {ARCADE_GAMES.filter((g) => visibleIds.has(g.id)).slice(0, 8).map((game) => (
              <li key={game.id}>
                <button type="button" onClick={() => selectGame(game.id)} data-active={game.id === selected.id ? 'true' : 'false'}>
                  <span>{game.shortName}</span>
                  <small>{game.tempo}</small>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </div>
  );
}
