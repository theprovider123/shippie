/**
 * Spatial memory — fingerprint the user's current physical context so apps can
 * adapt to "kitchen at home" vs "desk at work" without ever learning the raw
 * IP or coordinates.
 *
 * Source preference:
 *   1. WiFi — RTCPeerConnection ICE candidates, take a non-mDNS local IP and
 *      SHA-256 hash it. Stable across calls on the same network; different
 *      across networks.
 *   2. Geo — navigator.geolocation.getCurrentPosition with a 1s timeout,
 *      coords rounded to 0.001° (≈100m), SHA-256 hash "lat,lon".
 *   3. Unavailable — both failed. Return null so callers know not to scope.
 *
 * The raw IP/coords NEVER leave this module. Only the hash is persisted.
 *
 * All deps are injectable so tests can swap navigator + RTCPeerConnection +
 * geolocation without touching globals.
 */
import { getSpace, setSpaceLabelStored, upsertSpace } from './storage.ts';

export interface SpaceFingerprint {
  /** SHA-256 hex of (preferred WiFi-derived signal OR rounded geo). */
  id: string;
  /** Source signal — diagnostic only, not user-facing. */
  source: 'wifi' | 'geo' | 'unavailable';
  /** Maker-set label. Null until the user names the space. */
  label: string | null;
  /** ms when first observed. */
  firstSeenAt: number;
  /** ms of most recent observation. */
  lastSeenAt: number;
  /** Number of observations in this space. */
  observations: number;
}

/**
 * RTCPeerConnection-shaped subset we depend on. Tests inject a fake.
 */
interface RTCPeerConnectionLike {
  createDataChannel(label: string): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(desc: { type: string; sdp?: string }): Promise<void>;
  onicecandidate: ((event: { candidate: { candidate: string } | null }) => void) | null;
  close(): void;
}

interface NavigatorLike {
  geolocation?: {
    getCurrentPosition(
      success: (pos: { coords: { latitude: number; longitude: number } }) => void,
      error?: (err: { code?: number; message?: string }) => void,
      options?: { timeout?: number; maximumAge?: number; enableHighAccuracy?: boolean },
    ): void;
  };
}

export interface CurrentSpaceDeps {
  navigator?: NavigatorLike;
  subtle?: SubtleCrypto;
  now?: () => number;
  /**
   * RTCPeerConnection constructor. Defaults to globalThis.RTCPeerConnection
   * when present. Tests inject a fake constructor.
   */
  RTCPeerConnection?: new (config?: { iceServers?: Array<{ urls: string }> }) => RTCPeerConnectionLike;
  /** Override the WiFi gather timeout. Default 1000ms. */
  wifiTimeoutMs?: number;
  /** Override the geo timeout. Default 1000ms. */
  geoTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;

// Match IPv4 and IPv6 in `candidate:` strings. mDNS hostnames look like
// `<uuid>.local` and we explicitly skip them — they're per-session random and
// not useful as a stable space signal.
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IPV6_RE = /\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{1,4}\b/i;
const MDNS_RE = /\b[0-9a-f-]+\.local\b/i;

function pickLocalIp(candidate: string): string | null {
  if (MDNS_RE.test(candidate)) return null;
  const v4 = candidate.match(IPV4_RE);
  if (v4) return v4[0];
  const v6 = candidate.match(IPV6_RE);
  if (v6) return v6[0];
  return null;
}

async function sha256Hex(subtle: SubtleCrypto, input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i += 1) {
    const byte = view[i] ?? 0;
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

async function tryWifiFingerprint(deps: CurrentSpaceDeps): Promise<string | null> {
  const globalPC =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { RTCPeerConnection?: CurrentSpaceDeps['RTCPeerConnection'] })
          .RTCPeerConnection
      : undefined;
  const PCCtor = deps.RTCPeerConnection ?? globalPC;
  if (!PCCtor) return null;
  const subtle = deps.subtle ?? (typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined);
  if (!subtle) return null;

  const timeoutMs = deps.wifiTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  let pc: RTCPeerConnectionLike | null = null;
  try {
    pc = new PCCtor({ iceServers: [] });
    pc.createDataChannel('shippie-spatial');

    const ip = await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);

      try {
        if (pc) {
          pc.onicecandidate = (event) => {
            const cand = event.candidate?.candidate;
            if (!cand) return;
            const found = pickLocalIp(cand);
            if (found) {
              clearTimeout(timer);
              finish(found);
            }
          };
        }

        // Kick off ICE gathering. We don't await this in the outer scope
        // because `finish` may resolve earlier from onicecandidate.
        void (async () => {
          try {
            if (!pc) return;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
          } catch {
            clearTimeout(timer);
            finish(null);
          }
        })();
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });

    if (!ip) return null;
    return await sha256Hex(subtle, `wifi:${ip}`);
  } catch {
    return null;
  } finally {
    try {
      pc?.close();
    } catch {
      // best-effort cleanup
    }
  }
}

async function tryGeoFingerprint(deps: CurrentSpaceDeps): Promise<string | null> {
  const nav =
    deps.navigator ??
    (typeof globalThis !== 'undefined'
      ? ((globalThis as { navigator?: NavigatorLike }).navigator as NavigatorLike | undefined)
      : undefined);
  if (!nav?.geolocation) return null;
  const subtle = deps.subtle ?? (typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined);
  if (!subtle) return null;

  const timeoutMs = deps.geoTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const coords = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      let settled = false;
      const finish = (value: { latitude: number; longitude: number } | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);

      try {
        nav.geolocation!.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          },
          () => {
            clearTimeout(timer);
            finish(null);
          },
          { timeout: timeoutMs, maximumAge: 0 },
        );
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });

    if (!coords) return null;
    // Round to 0.001° (~100m).
    const lat = Math.round(coords.latitude * 1000) / 1000;
    const lon = Math.round(coords.longitude * 1000) / 1000;
    return await sha256Hex(subtle, `geo:${lat},${lon}`);
  } catch {
    return null;
  }
}

async function fingerprint(
  deps: CurrentSpaceDeps,
): Promise<{ id: string; source: 'wifi' | 'geo' } | null> {
  const wifi = await tryWifiFingerprint(deps);
  if (wifi) return { id: wifi, source: 'wifi' };
  const geo = await tryGeoFingerprint(deps);
  if (geo) return { id: geo, source: 'geo' };
  return null;
}

/**
 * Returns the current space fingerprint, recording an observation in storage.
 *
 * Returns a row with `source: 'unavailable'` when both WiFi and geo failed
 * (still null id-wise — we return the structure as `null` to keep the contract
 * "no fingerprint -> no space"). The caller distinguishes `null` (no space) vs
 * a real fingerprint with a stored row.
 */
export async function currentSpace(deps: CurrentSpaceDeps = {}): Promise<SpaceFingerprint | null> {
  const now = deps.now ?? Date.now;
  const fp = await fingerprint(deps);
  if (!fp) return null;
  const stored = await upsertSpace({ id: fp.id }, fp.source, now());
  // Stored row holds the canonical first-seen source; we return that.
  return {
    id: stored.id,
    source: stored.source,
    label: stored.label,
    firstSeenAt: stored.firstSeenAt,
    lastSeenAt: stored.lastSeenAt,
    observations: stored.observations,
  };
}

/**
 * Sets the user-facing label on a space. No-op if the space hasn't been
 * observed yet — call `currentSpace()` first.
 */
export async function setSpaceLabel(id: string, label: string): Promise<void> {
  await setSpaceLabelStored(id, label);
}

/**
 * Internal — exposed for tests and adjacent intelligence modules that want to
 * inspect the persisted state without re-running fingerprinting.
 */
export async function _peekSpace(id: string): Promise<SpaceFingerprint | null> {
  const row = await getSpace(id);
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    label: row.label,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    observations: row.observations,
  };
}
