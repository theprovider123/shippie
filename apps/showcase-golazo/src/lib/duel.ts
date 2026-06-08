// Penalty Duel — two-sided async head-to-head. Each player is BOTH striker and
// keeper: you place 5 shots and choose 5 dives. A goal is scored when your shot
// goes where the opponent did NOT dive. The duel travels in a link, no backend.

export type Zone = -1 | 0 | 1; // left / middle / right (shot placement or dive)
export const PENS = 5;

export interface ShotPlacement {
  zone: Zone;
  /** 0..1 across the goal mouth, left post to right post. */
  x: number;
  /** 0..1 up the goal mouth, ground to crossbar. */
  y: number;
  /** 0..1, used to decide whether the keeper can get set. */
  power: number;
  /** -1..1, visual bend applied during the animation. */
  bend: number;
}

export interface DuelSide {
  name: string;
  shots: Zone[]; // where this player aimed each of 5 pens
  dives: Zone[]; // how this player's keeper dives for the opponent's 5 pens
  shotDetails?: ShotPlacement[]; // optional richer placement for new links
}

export interface Duel {
  a: DuelSide;
  b?: DuelSide; // present once the second player has replied
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function zoneFromX(x: number): Zone {
  return x < 0.38 ? -1 : x > 0.62 ? 1 : 0;
}

export function defaultShotPlacement(zone: Zone, index = 0): ShotPlacement {
  const side = zone === -1 ? 0.23 : zone === 1 ? 0.77 : 0.5;
  const n = Math.sin((index + 1) * 9.17 + zone * 2.1);
  return {
    zone,
    x: clamp(side + n * 0.025, 0.08, 0.92),
    y: zone === 0 ? 0.42 : 0.55,
    power: 0.72,
    bend: 0,
  };
}

export function normaliseShotPlacement(input: ShotPlacement | undefined, fallbackZone: Zone, index = 0): ShotPlacement {
  const base = defaultShotPlacement(fallbackZone, index);
  if (!input) return base;
  const x = clamp(Number.isFinite(input.x) ? input.x : base.x, 0.04, 0.96);
  const y = clamp(Number.isFinite(input.y) ? input.y : base.y, 0.04, 0.96);
  return {
    zone: zoneFromX(x),
    x,
    y,
    power: clamp(Number.isFinite(input.power) ? input.power : base.power, 0.25, 1),
    bend: clamp(Number.isFinite(input.bend) ? input.bend : 0, -1, 1),
  };
}

export function penaltyShotSaved(shot: ShotPlacement, keeperDive: Zone): boolean {
  const keeperX = keeperDive === -1 ? 0.24 : keeperDive === 1 ? 0.76 : 0.5;
  const keeperY = keeperDive === 0 ? 0.36 : 0.46;
  const slowBonus = (1 - shot.power) * 0.08;
  const reachX = (keeperDive === 0 ? 0.17 : 0.22) + slowBonus;
  const reachY = 0.31 + slowBonus;
  const dx = Math.abs(shot.x - keeperX) / reachX;
  const dy = Math.abs(shot.y - keeperY) / reachY;
  const bendPenalty = Math.abs(shot.bend) * 0.08;
  const powerPenalty = shot.power * 0.07;
  return dx * dx + dy * dy < 1 - bendPenalty - powerPenalty;
}

/** Goals: old links keep zone scoring; new links use placement, height and pace. */
export function goalsAgainst(shots: Zone[], keeperDives: Zone[], shotDetails?: ShotPlacement[]): number {
  let g = 0;
  for (let i = 0; i < Math.min(shots.length, keeperDives.length); i++) {
    if (!shotDetails?.[i]) {
      if (shots[i] !== keeperDives[i]) g++;
      continue;
    }
    const shot = normaliseShotPlacement(shotDetails[i], shots[i], i);
    if (!penaltyShotSaved(shot, keeperDives[i])) g++;
  }
  return g;
}

export interface DuelResult {
  aGoals: number;
  bGoals: number;
  outcome: "a" | "b" | "draw";
}

/** Resolve a completed duel. A shoots vs B's dives; B shoots vs A's dives. */
export function resolveDuel(a: DuelSide, b: DuelSide): DuelResult {
  const aGoals = goalsAgainst(a.shots, b.dives, a.shotDetails);
  const bGoals = goalsAgainst(b.shots, a.dives, b.shotDetails);
  return { aGoals, bGoals, outcome: aGoals > bGoals ? "a" : bGoals > aGoals ? "b" : "draw" };
}

// ── Codec (#duel=) ───────────────────────────────────────────────────────────
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type ShotWire = [number, number, number, number];
interface SideWire { n: string; s: number[]; d: number[]; p?: ShotWire[] }
interface DuelWire { a: SideWire; b?: SideWire }

function sideWire(s: DuelSide): SideWire {
  return {
    n: s.name.slice(0, 24),
    s: s.shots.map(Number),
    d: s.dives.map(Number),
    ...(s.shotDetails?.length
      ? { p: s.shotDetails.map((p) => [p.x, p.y, p.power, p.bend] as ShotWire) }
      : {}),
  };
}
function wireSide(w: SideWire): DuelSide {
  const z = (n: number): Zone => (n < 0 ? -1 : n > 0 ? 1 : 0);
  const shots = (w.s ?? []).map(z);
  const shotDetails = Array.isArray(w.p)
    ? w.p.map((p, i) => normaliseShotPlacement({
        zone: shots[i] ?? 0,
        x: Number(p?.[0]),
        y: Number(p?.[1]),
        power: Number(p?.[2]),
        bend: Number(p?.[3]),
      }, shots[i] ?? 0, i))
    : undefined;
  return { name: w.n || "A mate", shots, dives: (w.d ?? []).map(z), ...(shotDetails ? { shotDetails } : {}) };
}

export function encodeDuel(d: Duel): string {
  const wire: DuelWire = { a: sideWire(d.a), ...(d.b ? { b: sideWire(d.b) } : {}) };
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(wire)));
}

export function decodeDuel(code: string): Duel | null {
  try {
    const w = JSON.parse(new TextDecoder().decode(b64urlDecode(code.trim()))) as DuelWire;
    if (!w || !w.a || !Array.isArray(w.a.s)) return null;
    return { a: wireSide(w.a), ...(w.b ? { b: wireSide(w.b) } : {}) };
  } catch {
    return null;
  }
}

export function duelUrl(d: Duel, base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined" ? location.origin + location.pathname : "https://shippie.app/run/golazo/");
  return `${root}#duel=${encodeDuel(d)}`;
}

export function readDuelFromHash(hash: string): Duel | null {
  const m = /[#&]duel=([^&]+)/.exec(hash);
  return m ? decodeDuel(m[1]) : null;
}
