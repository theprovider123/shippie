/**
 * Minimal ULID generator — 48-bit timestamp + 80-bit randomness, encoded
 * in Crockford base32. Lexically sortable by time, collision-resistant
 * across concurrent writers without coordination.
 *
 * Stand-alone implementation so the package has zero runtime deps.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let n = now;
  let out = '';
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = n % 32;
    out = ALPHABET[mod]! + out;
    n = (n - mod) / 32;
  }
  return out;
}

function encodeRandom(rng: () => Uint8Array): string {
  const bytes = rng();
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    out += ALPHABET[bytes[i]! % 32]!;
  }
  return out;
}

function defaultRng(): Uint8Array {
  const bytes = new Uint8Array(RANDOM_LEN);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < RANDOM_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function ulid(now: number = Date.now(), rng: () => Uint8Array = defaultRng): string {
  if (!Number.isFinite(now) || now < 0) {
    throw new RangeError(`ulid: invalid timestamp ${now}`);
  }
  return encodeTime(now) + encodeRandom(rng);
}
