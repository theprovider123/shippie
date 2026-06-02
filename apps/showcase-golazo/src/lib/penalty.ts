// Penalty Shootout — async head-to-head. The link IS the match: the challenger's
// 5 kicks + a shared seed travel in the URL, the responder takes the same 5 (same
// keeper behaviour from the seed) and the result is computed locally. No backend.

export type KickOutcome = "g" | "s" | "m"; // goal / saved / miss

export interface Shootout {
  seed: string;
  name: string;
  kicks: KickOutcome[];
}

export const PENS = 5;

/** Goals scored in a kick list. */
export function goals(kicks: KickOutcome[]): number {
  return kicks.filter((k) => k === "g").length;
}

export interface ShootoutResult {
  me: number;
  them: number;
  outcome: "win" | "lose" | "draw";
}

/** Compare my kicks against the challenger's. */
export function resolveShootout(mine: KickOutcome[], theirs: KickOutcome[]): ShootoutResult {
  const me = goals(mine);
  const them = goals(theirs);
  return { me, them, outcome: me > them ? "win" : me < them ? "lose" : "draw" };
}

/** FNV-1a → 32-bit, for deterministic keeper dives from a seed. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which way the keeper commits for kick `i` of a shootout with this seed.
 * -1 = dives left, 0 = stays centre, 1 = dives right. Deterministic so both
 * players in a head-to-head face the identical keeper.
 */
export function keeperDiveFor(seed: string, kickIndex: number): -1 | 0 | 1 {
  const n = hashStr(`${seed}:${kickIndex}`);
  const r = n % 3;
  return (r - 1) as -1 | 0 | 1;
}

export function makeSeed(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const rand = new Uint32Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
    for (let i = 0; i < 6; i++) out += alphabet[rand[i] % alphabet.length];
  } else {
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ── Challenge link (#pk=) ────────────────────────────────────────────────────
// Wire: seed~name~kicks  e.g. "AB12CD~Sam~ggsmg"
export function encodeShootout(s: Shootout): string {
  return `${s.seed}~${encodeURIComponent(s.name.slice(0, 24))}~${s.kicks.join("")}`;
}

export function decodeShootout(code: string): Shootout | null {
  const m = /^([A-Z0-9]{4,10})~([^~]*)~([gsm]{0,10})$/.exec(code.trim());
  if (!m) return null;
  return {
    seed: m[1],
    name: decodeURIComponent(m[2]) || "A mate",
    kicks: [...m[3]] as KickOutcome[],
  };
}

export function shootoutUrl(s: Shootout, base?: string): string {
  const root =
    base ??
    (typeof location !== "undefined" ? location.origin + location.pathname : "https://shippie.app/run/golazo/");
  return `${root}#pk=${encodeShootout(s)}`;
}

export function readShootoutFromHash(hash: string): Shootout | null {
  const m = /[#&]pk=([^&]+)/.exec(hash);
  return m ? decodeShootout(m[1]) : null;
}
