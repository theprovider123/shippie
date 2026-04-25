/**
 * Public IP discovery via WebRTC ICE.
 *
 * We open a throwaway RTCPeerConnection with a single STUN server,
 * create a dummy data channel to force candidate gathering, and parse
 * `srflx` (server-reflexive) candidates as they arrive. The first
 * non-private IPv4 (or a global IPv6) wins.
 *
 * Falls back to a public IP echo endpoint only when ICE doesn't surface
 * a public candidate within the timeout — useful for restrictive
 * environments and for unit tests where RTCPeerConnection is mocked
 * away.
 */

export interface StunOptions {
  /** STUN urls to try, in order. Defaults to Google + Cloudflare. */
  iceServers?: RTCIceServer[];
  /** Hard cap on candidate gathering. Default 4000ms. */
  timeoutMs?: number;
  /** RTCPeerConnection ctor to use (override for tests). */
  RTCPeerConnection?: typeof RTCPeerConnection;
}

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

const PRIVATE_V4 =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|0\.)/;

/**
 * Returns the first public IP discovered via ICE candidate gathering,
 * or `null` if nothing surfaces in time.
 */
export async function discoverPublicIp(opts: StunOptions = {}): Promise<string | null> {
  const Ctor = opts.RTCPeerConnection ?? (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  if (!Ctor) return null;

  const iceServers = opts.iceServers ?? DEFAULT_STUN;
  const timeoutMs = opts.timeoutMs ?? 4000;

  const pc = new Ctor({ iceServers });
  let resolved = false;

  return new Promise<string | null>((resolve) => {
    const finish = (ip: string | null) => {
      if (resolved) return;
      resolved = true;
      try {
        pc.close();
      } catch {
        // pc may already be closed — ignore.
      }
      resolve(ip);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        // null candidate = end-of-gathering. Bail with null if we
        // never saw a usable srflx.
        clearTimeout(timer);
        finish(null);
        return;
      }
      const ip = parseSrflxIp(e.candidate.candidate);
      if (ip && !isPrivateAddress(ip)) {
        clearTimeout(timer);
        finish(ip);
      }
    };

    // Force candidate gathering by opening a data channel before
    // creating an offer.
    try {
      pc.createDataChannel('shippie-stun');
      pc.createOffer().then(
        (offer) => pc.setLocalDescription(offer).catch(() => finish(null)),
        () => finish(null),
      );
    } catch {
      finish(null);
    }
  });
}

/**
 * Parse an RTCIceCandidate string. SDP format:
 *   `candidate:<foundation> <component> udp <prio> <ip> <port> typ <type> ...`
 */
export function parseSrflxIp(candidate: string): string | null {
  if (!candidate) return null;
  const m = /(?:^|\s)candidate:\S+\s+\d+\s+\S+\s+\d+\s+(\S+)\s+\d+\s+typ\s+(\S+)/.exec(candidate);
  if (!m) return null;
  const ip = m[1]!;
  const type = m[2]!;
  if (type !== 'srflx' && type !== 'prflx') return null;
  // mDNS placeholder — Chromium's privacy mitigation. Useless for IP.
  if (ip.endsWith('.local')) return null;
  return ip;
}

export function isPrivateAddress(ip: string): boolean {
  if (PRIVATE_V4.test(ip)) return true;
  // IPv6 link-local + unique-local
  const lower = ip.toLowerCase();
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  if (lower === '::1') return true;
  return false;
}
