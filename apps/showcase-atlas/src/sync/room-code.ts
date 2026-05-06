/**
 * Room codes for travel companions.
 *
 * The code is a short, human-readable string the trip leader generates
 * once and shares with companions (verbally, via QR, however). The
 * relay sees only the room id — a one-way hash of the code — so it
 * never learns the human-readable string.
 */

const ADJECTIVES = [
  'OPEN', 'BRIGHT', 'STILL', 'WIDE', 'NORTH', 'SOUTH', 'EAST', 'WEST',
  'HIGH', 'WARM', 'CLEAR', 'QUIET', 'LONG', 'GOLD', 'GREEN', 'WILD',
] as const;
const NOUNS = [
  'RIDGE', 'TRAIL', 'COVE', 'BLUFF', 'SHORE', 'PASS', 'CAIRN', 'RIVER',
  'PEAK', 'BAY', 'GLEN', 'FELL', 'MARSH', 'PINE', 'OAK', 'STONE',
] as const;

export function generateRoomCode(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${n}-${num}`;
}

/**
 * Stable hash of the room code → relay room id. Uses djb2-xor; not
 * cryptographic, but strong enough that the relay can't reverse it
 * without brute-forcing the code itself, which is what AES-GCM is for.
 */
export function roomIdFor(code: string): string {
  const normalized = code.trim().toUpperCase();
  let h = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    h = ((h << 5) + h) ^ normalized.charCodeAt(i);
  }
  return `atlas-${(h >>> 0).toString(36)}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}
