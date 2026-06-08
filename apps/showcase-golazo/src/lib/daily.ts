// Daily-challenge seeding. A date maps to a stable seed so every player faces the same
// deterministic wall/keeper/wind sequence on a given day — making arcade scores comparable
// on the leaderboard. Pure: pass a Date in (tests pass a fixed one).

/** Local calendar day as yyyy-mm-dd. */
export function dailyKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A 32-bit seed derived from the calendar day. Stable within a day, varies across days. */
export function dailySeed(d: Date = new Date()): number {
  const key = dailyKey(d);
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG. Returns a function yielding [0,1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
