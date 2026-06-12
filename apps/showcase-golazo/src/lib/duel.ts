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

export function penaltyShotSavedWithReach(shot: ShotPlacement, keeperDive: Zone, reachScale = 1): boolean {
  const reach = clamp(reachScale, 0.75, 1.35);
  const keeperX = keeperDive === -1 ? 0.24 : keeperDive === 1 ? 0.76 : 0.5;
  const keeperY = keeperDive === 0 ? 0.39 : 0.52;
  const sameZone = keeperDive === shot.zone;
  const centralShot = Math.abs(shot.x - 0.5) < 0.14;
  const weakShot = 1 - shot.power;
  const slowBonus = weakShot * 0.12;
  const lowBonus = shot.y < 0.34 ? 0.07 : 0;
  const centreBonus = shot.zone === 0 ? 0.07 : 0;

  // Even when wrong-footed, a keeper should still stop tame scuffs through the
  // middle with a trailing boot/body. Anything quick, curled, or away from the
  // middle still beats the wrong dive.
  if (keeperDive !== shot.zone && centralShot) {
    const recoveryX = 0.12 + weakShot * 0.08 * reach;
    const recoveryY = 0.42 + weakShot * 0.24 * reach;
    if (
      Math.abs(shot.x - 0.5) < recoveryX &&
      shot.y < recoveryY &&
      shot.power < 0.78 &&
      Math.abs(shot.bend) < 0.35
    ) {
      return true;
    }
  }

  // Match the visible keeper: not just gloves, the head, torso, hips and legs
  // should all block shots. These normalized ellipses are deliberately smaller
  // than the sprite, then padded by a small ball radius so grazes still count.
  const ball = 0.026 + weakShot * 0.018;
  const hitBody = (cx: number, cy: number, rx: number, ry: number): boolean => {
    const dx = (shot.x - cx) / (rx * reach + ball);
    const dy = (shot.y - cy) / (ry * reach + ball * 0.82);
    return dx * dx + dy * dy <= 1;
  };
  const bodyCanSave = keeperDive === shot.zone || keeperDive === 0 || centralShot;
  if (bodyCanSave) {
    if (keeperDive === 0) {
      if (
        hitBody(0.5, 0.48, 0.12, 0.2) ||
        hitBody(0.5, 0.68, 0.06, 0.07) ||
        hitBody(0.39, 0.49, 0.08, 0.13) ||
        hitBody(0.61, 0.49, 0.08, 0.13) ||
        hitBody(0.45, 0.23, 0.06, 0.13) ||
        hitBody(0.55, 0.23, 0.06, 0.13)
      ) {
        return true;
      }
    } else {
      const dir = keeperDive;
      if (
        hitBody(keeperX, 0.5, 0.1, 0.21) ||
        hitBody(keeperX, 0.7, 0.055, 0.07) ||
        hitBody(keeperX + dir * 0.11, 0.58, 0.075, 0.15) ||
        hitBody(keeperX + dir * 0.18, 0.65, 0.06, 0.12) ||
        hitBody(keeperX - dir * 0.07, 0.44, 0.07, 0.15) ||
        hitBody(keeperX - dir * 0.02, 0.26, 0.075, 0.16) ||
        hitBody(keeperX - dir * 0.1, 0.2, 0.055, 0.12)
      ) {
        return true;
      }
    }
  }

  const reachX = ((keeperDive === 0 ? 0.2 : 0.25) + slowBonus + lowBonus + centreBonus) * reach;
  const reachY = ((keeperDive === 0 ? 0.34 : 0.39) + slowBonus + (sameZone ? 0.03 : 0)) * reach;
  const dx = Math.abs(shot.x - keeperX) / reachX;
  const dy = Math.abs(shot.y - keeperY) / reachY;
  const topCornerEscape =
    Math.max(0, Math.abs(shot.x - 0.5) - 0.34) * 0.55 +
    Math.max(0, shot.y - 0.76) * 0.45;
  const bendEscape = Math.abs(shot.bend) * 0.12;
  const powerEscape = shot.power * 0.08;
  const wrongZonePenalty = keeperDive !== shot.zone ? 0.34 : 0;
  return dx * dx + dy * dy < 1.08 - topCornerEscape - bendEscape - powerEscape - wrongZonePenalty;
}

export function penaltyShotSaved(shot: ShotPlacement, keeperDive: Zone): boolean {
  return penaltyShotSavedWithReach(shot, keeperDive, 1);
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

// ── Solo AI opponent ─────────────────────────────────────────────────────────
// For the solo shootout (no link). The AI reads the human's recent shot zones to guess
// where the next one goes, and when it shoots it telegraphs a readable "tell" the human
// can punish — usually honest, sometimes a feint. Pure + testable (pass rng in tests).

export interface KeeperRead {
  /** Zone the AI keeper commits to. */
  dive: Zone;
  /** 0..1 how strongly the human's history pointed there (drives the lean/tell). */
  confidence: number;
}

const ZONES_ALL: Zone[] = [-1, 0, 1];

function zoneCounts(history: Zone[]): Record<string, number> {
  const c: Record<string, number> = { "-1": 0, "0": 0, "1": 0 };
  for (const z of history) c[String(z)] = (c[String(z)] ?? 0) + 1;
  return c;
}

/** AI keeper read of where the human will shoot, from their recent placements. */
export function readShooter(history: Zone[], rng: () => number = Math.random): KeeperRead {
  const recent = history.slice(-6);
  if (recent.length === 0) {
    return { dive: ZONES_ALL[Math.floor(rng() * 3)] ?? 0, confidence: 0 };
  }
  const counts = zoneCounts(recent);
  let fav: Zone = 0, favN = -1;
  for (const z of ZONES_ALL) {
    const n = counts[String(z)] ?? 0;
    if (n > favN) { favN = n; fav = z; }
  }
  const frac = favN / recent.length;
  const confidence = clamp((frac - 1 / 3) / (2 / 3), 0, 1);
  // Dive the favoured way with a probability that grows with confidence; else guess.
  const readChance = 0.4 + confidence * 0.45;
  const dive = rng() < readChance ? fav : (ZONES_ALL[Math.floor(rng() * 3)] ?? 0);
  return { dive, confidence };
}

export interface AiStrike {
  /** Where the AI actually shoots. */
  zone: Zone;
  /** The tell it shows before striking — read it to dive the right way. */
  tell: Zone;
  /** True when the tell lies (a feint away from the real shot). */
  feint: boolean;
}

/**
 * AI striker for when the human keeps. It leans away from the human's favourite dive and
 * shows a tell that is honest most of the time, a feint occasionally — so diving is a read,
 * not a coin-flip. `humanDives` is the human's dive history (to avoid their pet zone).
 */
export function aiStrike(humanDives: Zone[], rng: () => number = Math.random): AiStrike {
  const counts = zoneCounts(humanDives.slice(-6));
  // Prefer the zone the human dives to LEAST.
  let zone: Zone = 0, leastN = Infinity;
  for (const z of ZONES_ALL) {
    const n = counts[String(z)] ?? 0;
    if (n < leastN) { leastN = n; zone = z; }
  }
  // 35% of the time just pick a random zone so it isn't fully predictable.
  if (rng() < 0.35) zone = ZONES_ALL[Math.floor(rng() * 3)] ?? 0;
  const feint = rng() < 0.3;
  const tell = feint
    ? (ZONES_ALL.filter((z) => z !== zone)[Math.floor(rng() * 2)] ?? zone)
    : zone;
  return { zone, tell, feint };
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
    (typeof location !== "undefined" ? location.origin + location.pathname : "https://shippie.app/golazo");
  return `${root}#duel=${encodeDuel(d)}`;
}

export function readDuelFromHash(hash: string): Duel | null {
  const m = /[#&]duel=([^&]+)/.exec(hash);
  return m ? decodeDuel(m[1]) : null;
}
