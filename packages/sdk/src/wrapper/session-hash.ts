// packages/sdk/src/wrapper/session-hash.ts
/**
 * Daily session hash — Phase 6.2.
 *
 * `dailySessionHash(deviceId, dateUtc, appSalt)` — stable on-device
 * SHA-256 used as the per-app per-day correlation token in analytics
 * beacons.
 *
 * Properties relied upon by the privacy story:
 *   1. Deterministic — same inputs always yield the same hash, so a
 *      device can be counted as one DAU even when sending multiple
 *      beacons in a day.
 *   2. Cross-day uncorrelatable — date is part of the hash. Yesterday's
 *      hash for the same device is unrelated.
 *   3. Cross-app uncorrelatable — appSalt is part of the hash. The
 *      same device shows as different hashes across apps.
 *   4. One-way — SHA-256 is irreversible. Even with the salt + date,
 *      a server cannot recover the deviceId from the hash.
 *
 * Implementation uses Web Crypto SubtleCrypto so it works in workers,
 * service workers, and the browser. Falls back to a deterministic
 * (but slow) JS implementation only for tests / Node environments
 * without subtle crypto.
 */

const HEX = '0123456789abcdef';

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    const hi = HEX[(b >>> 4) & 0xf]!;
    const lo = HEX[b & 0xf]!;
    out += hi + lo;
  }
  return out;
}

/**
 * Compute the daily session hash. Async because Web Crypto is async.
 *
 * @param deviceId  Opaque on-device identifier (UUIDv4 or similar).
 *                  Stored locally on the device, never transmitted as-is.
 * @param dateUtc   UTC date in YYYY-MM-DD form. Caller is responsible for
 *                  using a stable timezone-independent value.
 * @param appSalt   Per-app secret salt — different for every app on the
 *                  platform. Prevents cross-app correlation.
 */
export async function dailySessionHash(
  deviceId: string,
  dateUtc: string,
  appSalt: string,
): Promise<string> {
  if (!deviceId) throw new Error('dailySessionHash: deviceId required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) {
    throw new Error('dailySessionHash: dateUtc must be YYYY-MM-DD');
  }
  if (!appSalt) throw new Error('dailySessionHash: appSalt required');

  const input = `${deviceId}|${dateUtc}|${appSalt}`;
  const encoded = new TextEncoder().encode(input);

  // Prefer SubtleCrypto. Available in browsers, workers, and modern Node.
  const subtle =
    typeof crypto !== 'undefined' && crypto && 'subtle' in crypto ? crypto.subtle : null;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', encoded);
    return bytesToHex(new Uint8Array(buf));
  }

  // Pure-JS fallback. Only reached in environments without SubtleCrypto.
  return sha256Pure(encoded);
}

/**
 * Pure-JS SHA-256. Adapted from FIPS 180-4 reference. Used only when
 * SubtleCrypto is unavailable (legacy Node, sandboxed runtimes).
 */
function sha256Pure(message: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  // Pre-processing
  const ml = message.length * 8;
  const padLen = ((message.length + 9 + 63) & ~63) - message.length;
  const padded = new Uint8Array(message.length + padLen);
  padded.set(message);
  padded[message.length] = 0x80;
  // Big-endian 64-bit length at the end
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, ml >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000));

  const w = new Uint32Array(64);
  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunk + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [H[0]!, H[1]!, H[2]!, H[3]!, H[4]!, H[5]!, H[6]!, H[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += H[i]!.toString(16).padStart(8, '0');
  }
  return out;
}

function rotr(n: number, k: number): number {
  return (n >>> k) | (n << (32 - k));
}
