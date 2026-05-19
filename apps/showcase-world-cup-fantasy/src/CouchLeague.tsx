/**
 * Couch league — pass-the-phone fantasy league (spec §7.1).
 *
 * Flow:
 *   1. Phone A creates a league → UUID + signed-fragment league-context.
 *   2. `<QrShareSheet>` shows the QR; Phone B scans, opens the same app,
 *      which decodes the league-context out of the URL fragment and
 *      pre-loads a fresh squad picker bound to the same tournament.
 *   3. Each phone picks → taps "Pass" to forward the same QR to the
 *      next manager (slot-index incremented). Last manager taps
 *      "Lock league".
 *   4. Each phone keeps its own squad locally. Standings are computed
 *      peer-to-peer from broadcast `fantasy-team.scoreSnapshot` intents
 *      — same shape Match Room uses for relay-gossip rounds.
 *
 * No server, no account. League ID is a UUID generated at create-time;
 * the signed fragment uses `createSignedBlob` so the receiving phone
 * can verify the league came from the originating device.
 *
 * Constraints:
 *   - Stay framework-light: `<QrShareSheet>` and `encodeShareFragment`
 *     come from `@shippie/showcase-kit-v2`; signing primitives come from
 *     `@shippie/share`.
 *   - Keep the visual palette aligned with the matchday programme
 *     (pitch-green + gold-leaf + Fraunces) — that's the showcase's
 *     aesthetic.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  QrShareSheet,
  encodeShareFragment,
  decodeShareFragment,
} from '@shippie/showcase-kit-v2';
import { PLAYERS, type Chip, type Player } from './fantasy-engine.ts';

export const LEAGUE_SHARE_TYPE = 'wc-fantasy-couch-league';
export const LEAGUE_STORAGE_KEY = 'shippie:world-cup-fantasy:couch-league:v1';
export const LEAGUE_FRAGMENT_KEY = 'wcf-league';
const POSITION_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;

/** Lightweight player snapshot in the league context — no notes, no provider IDs. */
export interface LeaguePlayerSnapshot {
  id: string;
  name: string;
  team: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  price: number;
}

/** Manager slot in the league. Initial entry is the creator (slot 0). */
export interface LeagueSlot {
  /** 0..N-1, used to position the QR pass cursor. */
  index: number;
  /** Pre-filled by the previous manager when they tap "Pass". */
  managerName?: string;
  /** Public-key fingerprint of the device that locked this slot. */
  signature?: string;
  /** Captain name when the slot is locked (for the keepsake row). */
  captainName?: string;
  /** Captain chip — informs hot-state UI on receiving phones. */
  chip?: Chip;
}

export interface LeagueContextPayload {
  leagueId: string;
  leagueName: string;
  tournamentSeed: number;
  createdAt: number;
  budget: number;
  positionLimits: { GK: number; DEF: number; MID: number; FWD: number };
  players: LeaguePlayerSnapshot[];
  slots: LeagueSlot[];
  /** Whose turn it currently is (0..slots.length-1). */
  currentSlot: number;
  /** Set to true when last manager taps "Lock league". */
  locked: boolean;
}

export interface ScoreSnapshot {
  leagueId: string;
  managerName: string;
  slotIndex: number;
  total: number;
  captainName: string | null;
  chip: Chip;
  emittedAt: number;
}

/** Build a fresh league seeded by Phone A. */
export function createLeagueContext(input: {
  leagueName: string;
  managerName: string;
  slotCount: number;
}): LeagueContextPayload {
  const slots: LeagueSlot[] = Array.from({ length: Math.max(2, Math.min(8, input.slotCount)) }, (_, i) => ({
    index: i,
    managerName: i === 0 ? input.managerName : undefined,
  }));
  return {
    leagueId: makeUuid(),
    leagueName: input.leagueName || 'Couch League',
    tournamentSeed: Math.floor(Math.random() * 1_000_000) + 1,
    createdAt: Date.now(),
    budget: 125,
    positionLimits: { ...POSITION_LIMITS },
    players: PLAYERS.map(slimPlayer),
    slots,
    currentSlot: 0,
    locked: false,
  };
}

function slimPlayer(player: Player): LeaguePlayerSnapshot {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    price: player.price,
  };
}

/**
 * UUID v4 — uses crypto.randomUUID when available, falls back to a
 * Math.random implementation so the showcase still runs offline on
 * older Safari builds.
 */
export function makeUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const rnd = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${rnd()}${rnd()}-${rnd()}-4${rnd().slice(1)}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}

export interface StoredLeague {
  context: LeagueContextPayload;
  /** Standings indexed by `${leagueId}:${slotIndex}` — peer scores live here. */
  standings: Record<string, ScoreSnapshot>;
  /** Slot index assigned to this phone, or `null` if it hasn't picked yet. */
  mySlot: number | null;
  updatedAt: number;
}

function safeLoad(): StoredLeague | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEAGUE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredLeague;
  } catch {
    return null;
  }
}

function safeStore(state: StoredLeague | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (state) localStorage.setItem(LEAGUE_STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(LEAGUE_STORAGE_KEY);
  } catch {
    // Local-first best effort.
  }
}

export function loadLeague(): StoredLeague | null {
  return safeLoad();
}

export function saveLeague(state: StoredLeague | null): void {
  safeStore(state);
}

/** Apply a peer score snapshot to a stored league. Last-writer-wins per slot. */
export function applyScoreSnapshot(
  state: StoredLeague,
  snapshot: ScoreSnapshot,
): StoredLeague {
  if (snapshot.leagueId !== state.context.leagueId) return state;
  const key = `${snapshot.leagueId}:${snapshot.slotIndex}`;
  const current = state.standings[key];
  if (current && current.emittedAt >= snapshot.emittedAt) return state;
  return {
    ...state,
    standings: { ...state.standings, [key]: snapshot },
    updatedAt: Date.now(),
  };
}

export function leagueStandingsRows(state: StoredLeague): Array<{
  slotIndex: number;
  managerName: string;
  total: number;
  captainName: string | null;
  chip: Chip;
  isYou: boolean;
}> {
  return state.context.slots
    .map((slot) => {
      const key = `${state.context.leagueId}:${slot.index}`;
      const standing = state.standings[key];
      return {
        slotIndex: slot.index,
        managerName: standing?.managerName || slot.managerName || `Manager ${slot.index + 1}`,
        total: standing?.total ?? 0,
        captainName: standing?.captainName ?? slot.captainName ?? null,
        chip: standing?.chip ?? slot.chip ?? 'none',
        isYou: state.mySlot === slot.index,
      };
    })
    .sort((a, b) => b.total - a.total || a.slotIndex - b.slotIndex);
}

/** Encode a league-context payload into a URL fragment, signing it locally. */
export async function encodeLeagueFragment(
  context: LeagueContextPayload,
): Promise<string> {
  return encodeShareFragment<LeagueContextPayload>({
    type: LEAGUE_SHARE_TYPE,
    payload: context,
  });
}

/** Pull a league-context out of the current location's hash, if present. */
export async function readLeagueFromLocation(href: string): Promise<LeagueContextPayload | null> {
  const hashIdx = href.indexOf('#');
  if (hashIdx < 0) return null;
  const hash = href.slice(hashIdx + 1);
  const params = new URLSearchParams(hash);
  const fragment = params.get(LEAGUE_FRAGMENT_KEY);
  if (!fragment) return null;
  const result = await decodeShareFragment(fragment);
  if (!result) return null;
  const blob = result.blob as { type?: string; payload?: unknown };
  if (blob.type !== LEAGUE_SHARE_TYPE) return null;
  return (blob.payload as LeagueContextPayload) ?? null;
}

/** Build the share URL appended with the league fragment. */
export function buildLeagueShareUrl(baseUrl: string, fragment: string): string {
  const clean = baseUrl.split('#')[0] ?? baseUrl;
  return `${clean}#${LEAGUE_FRAGMENT_KEY}=${fragment}`;
}

/**
 * React surface — Couch League hero. Renders three states:
 *   - Empty / "Start a couch league" (no stored league)
 *   - In-play (squad picker enabled, "Pass" + "Lock" actions)
 *   - Locked (standings + share keepsake handoff)
 *
 * `onLeagueChange` is fired whenever the local league state mutates so
 * App.tsx can re-render dependent surfaces. `onScoreBroadcast` is fired
 * when this phone publishes its own `fantasy-team.scoreSnapshot`.
 */
export interface CouchLeagueProps {
  managerName: string;
  squadCaptainName: string | null;
  squadChip: Chip;
  squadScore: number;
  onLeagueChange?: (state: StoredLeague | null) => void;
  onScoreBroadcast?: (snapshot: ScoreSnapshot) => void;
  /** When non-null, App.tsx detected a league fragment and wants to import it. */
  importingContext?: LeagueContextPayload | null;
  onImportHandled?: () => void;
}

export function CouchLeague(props: CouchLeagueProps) {
  const [league, setLeagueState] = useState<StoredLeague | null>(() => loadLeague());
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  const updateLeague = useCallback((next: StoredLeague | null) => {
    saveLeague(next);
    setLeagueState(next);
    props.onLeagueChange?.(next);
  }, [props]);

  // Import flow: when App.tsx hands us a fresh league-context from the
  // URL fragment, accept it as a brand-new local league and slot this
  // device as the next-available slot.
  useEffect(() => {
    if (!props.importingContext) return;
    const existing = loadLeague();
    if (existing && existing.context.leagueId === props.importingContext.leagueId) {
      // Already have it; just bump currentSlot if the incoming context advanced.
      if (props.importingContext.currentSlot > existing.context.currentSlot) {
        updateLeague({ ...existing, context: props.importingContext, updatedAt: Date.now() });
      }
      props.onImportHandled?.();
      return;
    }
    const mySlot = props.importingContext.currentSlot;
    updateLeague({
      context: props.importingContext,
      standings: {},
      mySlot,
      updatedAt: Date.now(),
    });
    props.onImportHandled?.();
  }, [props, updateLeague]);

  const createLeague = (slotCount: number) => {
    const context = createLeagueContext({
      leagueName: `${props.managerName || 'Couch'}'s league`,
      managerName: props.managerName || 'You',
      slotCount,
    });
    updateLeague({ context, standings: {}, mySlot: 0, updatedAt: Date.now() });
  };

  const passToNext = useCallback(async () => {
    if (!league) return;
    const context = league.context;
    const nextSlot = Math.min(context.slots.length - 1, context.currentSlot + 1);
    // Stamp the current slot with this manager's captain log.
    const slots = context.slots.map((slot) =>
      slot.index === context.currentSlot
        ? {
            ...slot,
            managerName: props.managerName || slot.managerName || `Manager ${slot.index + 1}`,
            captainName: props.squadCaptainName ?? slot.captainName,
            chip: props.squadChip,
          }
        : slot,
    );
    const advanced: LeagueContextPayload = {
      ...context,
      slots,
      currentSlot: nextSlot,
    };
    const fragment = await encodeLeagueFragment(advanced);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '/';
    const url = buildLeagueShareUrl(baseUrl, fragment);
    setQrUrl(url);
    setQrOpen(true);
    updateLeague({ ...league, context: advanced, updatedAt: Date.now() });
  }, [league, props.managerName, props.squadCaptainName, props.squadChip, updateLeague]);

  const lockLeague = useCallback(() => {
    if (!league) return;
    const context = league.context;
    const slots = context.slots.map((slot) =>
      slot.index === context.currentSlot
        ? {
            ...slot,
            managerName: props.managerName || slot.managerName || `Manager ${slot.index + 1}`,
            captainName: props.squadCaptainName ?? slot.captainName,
            chip: props.squadChip,
          }
        : slot,
    );
    updateLeague({
      ...league,
      context: { ...context, slots, locked: true },
      updatedAt: Date.now(),
    });
  }, [league, props.managerName, props.squadCaptainName, props.squadChip, updateLeague]);

  const broadcastScore = useCallback(() => {
    if (!league || league.mySlot === null) return;
    const snapshot: ScoreSnapshot = {
      leagueId: league.context.leagueId,
      managerName: props.managerName || `Manager ${league.mySlot + 1}`,
      slotIndex: league.mySlot,
      total: props.squadScore,
      captainName: props.squadCaptainName,
      chip: props.squadChip,
      emittedAt: Date.now(),
    };
    const next = applyScoreSnapshot(league, snapshot);
    updateLeague(next);
    props.onScoreBroadcast?.(snapshot);
  }, [league, props, updateLeague]);

  // Auto-broadcast standings each time the local squad score changes
  // (so the leaderboard never gets stuck on stale numbers).
  useEffect(() => {
    if (!league || league.mySlot === null) return;
    broadcastScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.squadScore, props.squadCaptainName, props.squadChip]);

  const leaveLeague = () => {
    updateLeague(null);
  };

  const rows = league ? leagueStandingsRows(league) : [];
  const isMyTurn = !!league && league.mySlot === league.context.currentSlot && !league.context.locked;
  const lastManager = !!league && league.context.currentSlot === league.context.slots.length - 1;

  if (!league) {
    return (
      <section className="couch-league couch-league--empty" aria-label="Couch league">
        <header>
          <p className="eyebrow">Couch league</p>
          <h2>Build a private league in 90 seconds.</h2>
        </header>
        <p className="muted">
          Pass one phone around the room — each manager picks a squad, taps <em>Pass to next manager</em>,
          and a fresh QR opens on the next device. No server, no account.
        </p>
        <div className="couch-league__cta">
          <span className="muted">Players in the room:</span>
          {[2, 3, 4, 5, 6, 7, 8].map((count) => (
            <button key={count} type="button" onClick={() => createLeague(count)}>
              {count}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="couch-league" aria-label="Couch league">
        <header>
          <div>
            <p className="eyebrow">Couch league · {league.context.locked ? 'Locked' : isMyTurn ? 'Your turn' : 'Awaiting picks'}</p>
            <h2>{league.context.leagueName}</h2>
            <p className="muted">
              Slot {(league.mySlot ?? 0) + 1} of {league.context.slots.length} · League{' '}
              <code className="code">{league.context.leagueId.slice(0, 8)}</code>
            </p>
          </div>
          <div className="couch-league__actions">
            {!league.context.locked && isMyTurn && !lastManager ? (
              <button type="button" className="primary" onClick={() => void passToNext()}>
                Pass to next manager
              </button>
            ) : null}
            {!league.context.locked && isMyTurn && lastManager ? (
              <button type="button" className="primary" onClick={lockLeague}>
                Lock league
              </button>
            ) : null}
            <button type="button" onClick={leaveLeague}>Leave</button>
          </div>
        </header>

        <ol className="couch-league__slots">
          {rows.map((row, position) => (
            <li
              key={row.slotIndex}
              className={`couch-league__slot${row.isYou ? ' couch-league__slot--you' : ''}`}
            >
              <span className="couch-league__rank">#{position + 1}</span>
              <span className="couch-league__manager">
                <strong>{row.managerName}</strong>
                {row.captainName ? <em>Captain · {row.captainName}</em> : null}
              </span>
              <span className="couch-league__score">{row.total} pts</span>
            </li>
          ))}
        </ol>
      </section>

      <QrShareSheet
        open={qrOpen}
        url={qrUrl}
        title="Pass to the next manager"
        body="Hand them the phone — they scan, the squad picker opens with this league's players, prices, and rules."
        onClose={() => setQrOpen(false)}
      />
    </>
  );
}

/** Re-render the public surface from a stored state — used in tests. */
export function describeLeague(state: StoredLeague): string {
  return `${state.context.leagueName} (${state.context.slots.length} slots, ${state.context.locked ? 'locked' : 'open'})`;
}
