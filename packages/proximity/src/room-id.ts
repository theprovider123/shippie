/**
 * Room id derivation: sha256(public_ip + ':' + app_slug + ':' + group_code).
 *
 * The public IP is a coarse network bucket — devices behind the same
 * carrier-grade NAT will collide unless the group code differentiates
 * them. Group code is 8 chars of base32 (~40 bits), so collisions among
 * intentional rendezvous attempts are vanishingly rare on the same NAT.
 *
 * We deliberately separate inputs with `:` so an attacker can't grind
 * one input boundary into another (`ip=A:B`, `slug=` vs `ip=A`,
 * `slug=B:`).
 */
const enc = new TextEncoder();

export async function deriveRoomId(
  publicIp: string,
  appSlug: string,
  groupCode: string,
): Promise<string> {
  if (!publicIp) throw new Error('deriveRoomId: publicIp is empty');
  if (!appSlug) throw new Error('deriveRoomId: appSlug is empty');
  if (!groupCode) throw new Error('deriveRoomId: groupCode is empty');

  const input = enc.encode(`${normalizeIp(publicIp)}:${appSlug}:${groupCode.toUpperCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bufferToHex(new Uint8Array(digest));
}

/**
 * Generate a fresh 8-character base32 join code (Crockford alphabet,
 * no padding). 8 × 5 = 40 random bits.
 */
export function generateJoinCode(): string {
  const ALPHA = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  // Crockford-style alphabet — drops I, L, O, U, 0, 1.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHA[buf[i]! % ALPHA.length];
  return out;
}

/**
 * Normalize an IP for hashing. We lower-case any IPv6 (canonical hex
 * digits already lowercase but be defensive) and trim whitespace.
 * IPv4-mapped IPv6 (::ffff:1.2.3.4) is reduced to its IPv4 form so two
 * peers on the same /24 can't fail to collide because one stack
 * advertised v4 and the other v6.
 */
export function normalizeIp(ip: string): string {
  const t = ip.trim().toLowerCase();
  if (t.startsWith('::ffff:')) return t.slice(7);
  return t;
}

function bufferToHex(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += buf[i]!.toString(16).padStart(2, '0');
  return s;
}
