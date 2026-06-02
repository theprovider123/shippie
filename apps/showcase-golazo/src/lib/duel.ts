// Penalty Duel — two-sided async head-to-head. Each player is BOTH striker and
// keeper: you place 5 shots and choose 5 dives. A goal is scored when your shot
// goes where the opponent did NOT dive. The duel travels in a link, no backend.

export type Zone = -1 | 0 | 1; // left / middle / right (shot placement or dive)
export const PENS = 5;

export interface DuelSide {
  name: string;
  shots: Zone[]; // where this player aimed each of 5 pens
  dives: Zone[]; // how this player's keeper dives for the opponent's 5 pens
}

export interface Duel {
  a: DuelSide;
  b?: DuelSide; // present once the second player has replied
}

/** Goals: a shot beats the keeper when its zone differs from the keeper's dive. */
export function goalsAgainst(shots: Zone[], keeperDives: Zone[]): number {
  let g = 0;
  for (let i = 0; i < Math.min(shots.length, keeperDives.length); i++) {
    if (shots[i] !== keeperDives[i]) g++;
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
  const aGoals = goalsAgainst(a.shots, b.dives);
  const bGoals = goalsAgainst(b.shots, a.dives);
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

interface SideWire { n: string; s: number[]; d: number[] }
interface DuelWire { a: SideWire; b?: SideWire }

function sideWire(s: DuelSide): SideWire {
  return { n: s.name.slice(0, 24), s: s.shots.map(Number), d: s.dives.map(Number) };
}
function wireSide(w: SideWire): DuelSide {
  const z = (n: number): Zone => (n < 0 ? -1 : n > 0 ? 1 : 0);
  return { name: w.n || "A mate", shots: (w.s ?? []).map(z), dives: (w.d ?? []).map(z) };
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
