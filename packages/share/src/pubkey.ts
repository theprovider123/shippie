/**
 * Per-device key management.
 *
 * On first `getOrCreateDeviceKey()` call, generate an ECDSA P-256
 * keypair and persist it as JWK in localStorage. Subsequent calls
 * import and return the same key. The pubkey is exported as base64url
 * SPKI for inclusion in share blobs.
 *
 * The display name (`shippie:share:device-name`) is set by the user
 * via setDeviceName() and surfaces as `author.name` on outgoing
 * blobs. Defaults to a friendly random name on first run.
 */
import { bytesToBase64url } from './blob.ts';

const KEY_STORAGE_KEY = 'shippie:share:device-key';
const NAME_STORAGE_KEY = 'shippie:share:device-name';

interface StoredKeyPair {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
}

export interface DeviceKey {
  /** Base64url SPKI of the ECDSA P-256 public key. */
  pubkey: string;
  /** The CryptoKey object — non-extractable when re-imported. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

let cached: DeviceKey | null = null;

async function importKeypair(stored: StoredKeyPair): Promise<DeviceKey> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    stored.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable once re-imported — the JWK in storage is the source of truth
    ['sign'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    stored.publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return {
    pubkey: bytesToBase64url(new Uint8Array(spki)),
    privateKey,
    publicKey,
  };
}

async function generateKeypair(): Promise<{ stored: StoredKeyPair; key: DeviceKey }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const stored: StoredKeyPair = { privateJwk, publicJwk };
  const key = await importKeypair(stored);
  return { stored, key };
}

/**
 * Returns the device's signing key, creating one on first call.
 * Idempotent + cached across the page lifetime.
 */
export async function getOrCreateDeviceKey(): Promise<DeviceKey> {
  if (cached) return cached;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(KEY_STORAGE_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredKeyPair;
        cached = await importKeypair(stored);
        return cached;
      } catch {
        // Corrupted — regenerate.
      }
    }
  }
  const { stored, key } = await generateKeypair();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Private mode / quota — best-effort. Key still works for this session.
    }
  }
  cached = key;
  return key;
}

const FRIENDLY_FIRSTS = [
  'kind', 'soft', 'warm', 'bright', 'gentle', 'quiet', 'tender', 'small',
];
const FRIENDLY_SECONDS = [
  'crane', 'willow', 'ember', 'tide', 'meadow', 'cotton', 'honey', 'lantern',
];

function pickRandom<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function getDeviceName(): string {
  if (typeof localStorage === 'undefined') return generateFriendlyName();
  const stored = localStorage.getItem(NAME_STORAGE_KEY);
  if (stored) return stored;
  const fresh = generateFriendlyName();
  try {
    localStorage.setItem(NAME_STORAGE_KEY, fresh);
  } catch {
    /* best-effort */
  }
  return fresh;
}

export function setDeviceName(name: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(NAME_STORAGE_KEY, trimmed);
  } catch {
    /* best-effort */
  }
}

function generateFriendlyName(): string {
  return `${pickRandom(FRIENDLY_FIRSTS)} ${pickRandom(FRIENDLY_SECONDS)}`;
}

/**
 * Test-only: drop the in-memory cached key + (optionally) the
 * persisted localStorage entries. Defaults to dropping both for
 * test isolation; pass `{ keepStorage: true }` to simulate a fresh
 * page load that re-imports from existing storage.
 */
export function _resetForTest(opts: { keepStorage?: boolean } = {}): void {
  cached = null;
  if (!opts.keepStorage && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(KEY_STORAGE_KEY);
      localStorage.removeItem(NAME_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}
