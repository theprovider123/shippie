/**
 * Cross-device handoff relay (Layer 2). A short-lived, account-scoped KV
 * rendezvous for moving an encrypted snapshot between two devices of the
 * same signed-in user.
 *
 * Modeled on the sealed-access relay, but kept separate: this carries an
 * app-state snapshot (larger cap), is namespaced by userId so only the
 * owner's own devices can participate, and the bundle is one-time
 * (consumed on first read so a snapshot can't linger).
 *
 * The relay only ever sees two ECDH public keys + ciphertext — it cannot
 * read the snapshot. When devices can reach each other directly (P2P),
 * the bundle skips the relay entirely; the relay is the works-anywhere
 * fallback.
 */
import type { KVNamespace } from '@cloudflare/workers-types';

export const HANDOFF_OFFER_SCHEMA = 'shippie.handoff.offer.v1';
export const HANDOFF_BUNDLE_SCHEMA = 'shippie.handoff.bundle.v1';

export interface HandoffOffer {
  schema: typeof HANDOFF_OFFER_SCHEMA;
  /** Recipient (laptop) ECDH public key, base64url SPKI. */
  recipientPublicKey: string;
  /** App the recipient wants to continue, if any. */
  appSlug?: string;
  /** Friendly label of the recipient device, e.g. "Laptop · Chrome". */
  deviceLabel?: string;
  createdAt: string;
}

export interface HandoffBundle {
  schema: typeof HANDOFF_BUNDLE_SCHEMA;
  alg: 'ECDH-P256-AES-256-GCM';
  /** Sender (phone) ECDH public key, base64url SPKI. */
  senderPublicKey: string;
  nonce: string;
  ciphertext: string;
}

export interface HandoffEnv {
  CACHE?: KVNamespace;
}

const HANDOFF_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,3000000}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TTL_SECONDS = 5 * 60;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_OFFER_BYTES = 8 * 1024;
const OFFER_KEYS = new Set(['schema', 'recipientPublicKey', 'appSlug', 'deviceLabel', 'createdAt']);
const BUNDLE_KEYS = new Set(['schema', 'alg', 'senderPublicKey', 'nonce', 'ciphertext']);

export function isHandoffId(value: string | undefined): value is string {
  return typeof value === 'string' && HANDOFF_ID_RE.test(value);
}

/** Caller-generated rendezvous id; unguessable + account-scoped on read. */
export function newHandoffId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

export function validateHandoffOffer(value: unknown): HandoffOffer {
  if (!value || typeof value !== 'object') throw new Error('offer must be an object');
  for (const key of Object.keys(value)) {
    if (!OFFER_KEYS.has(key)) throw new Error(`unexpected field: ${key}`);
  }
  const o = value as Partial<HandoffOffer>;
  if (o.schema !== HANDOFF_OFFER_SCHEMA) throw new Error('unsupported offer schema');
  if (!isToken(o.recipientPublicKey)) throw new Error('invalid recipient public key');
  if (typeof o.createdAt !== 'string' || Number.isNaN(Date.parse(o.createdAt))) {
    throw new Error('invalid created-at');
  }
  if (o.appSlug != null && (typeof o.appSlug !== 'string' || !SLUG_RE.test(o.appSlug))) {
    throw new Error('invalid app slug');
  }
  if (o.deviceLabel != null && (typeof o.deviceLabel !== 'string' || o.deviceLabel.length > 120)) {
    throw new Error('invalid device label');
  }
  return {
    schema: o.schema,
    recipientPublicKey: o.recipientPublicKey,
    appSlug: o.appSlug,
    deviceLabel: o.deviceLabel,
    createdAt: o.createdAt,
  };
}

export function validateHandoffBundle(value: unknown): HandoffBundle {
  if (!value || typeof value !== 'object') throw new Error('bundle must be an object');
  for (const key of Object.keys(value)) {
    if (!BUNDLE_KEYS.has(key)) throw new Error(`unexpected field: ${key}`);
  }
  const b = value as Partial<HandoffBundle>;
  if (b.schema !== HANDOFF_BUNDLE_SCHEMA) throw new Error('unsupported bundle schema');
  if (b.alg !== 'ECDH-P256-AES-256-GCM') throw new Error('unsupported algorithm');
  if (!isToken(b.senderPublicKey)) throw new Error('invalid sender public key');
  if (!isToken(b.nonce)) throw new Error('invalid nonce');
  if (!isToken(b.ciphertext)) throw new Error('invalid ciphertext');
  return {
    schema: b.schema,
    alg: b.alg,
    senderPublicKey: b.senderPublicKey,
    nonce: b.nonce,
    ciphertext: b.ciphertext,
  };
}

export async function parseHandoffOffer(request: Request): Promise<HandoffOffer> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_OFFER_BYTES) throw new Error('offer too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateHandoffOffer(parsed);
}

export async function parseHandoffBundle(request: Request): Promise<HandoffBundle> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BUNDLE_BYTES) throw new Error('bundle too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BUNDLE_BYTES) throw new Error('bundle too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateHandoffBundle(parsed);
}

function offerKey(userId: string, id: string): string {
  return `handoff:v1:${userId}:${id}:offer`;
}
function bundleKey(userId: string, id: string): string {
  return `handoff:v1:${userId}:${id}:bundle`;
}

export async function storeHandoffOffer(
  env: HandoffEnv,
  userId: string,
  id: string,
  offer: HandoffOffer,
): Promise<{ id: string; expiresIn: number }> {
  if (!env.CACHE) throw new Error('handoff relay unavailable');
  await env.CACHE.put(offerKey(userId, id), JSON.stringify(offer), { expirationTtl: TTL_SECONDS });
  return { id, expiresIn: TTL_SECONDS };
}

export async function readHandoffOffer(
  env: HandoffEnv,
  userId: string,
  id: string,
): Promise<HandoffOffer | null> {
  if (!env.CACHE) throw new Error('handoff relay unavailable');
  const raw = await env.CACHE.get(offerKey(userId, id));
  if (!raw) return null;
  try {
    return validateHandoffOffer(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function storeHandoffBundle(
  env: HandoffEnv,
  userId: string,
  id: string,
  bundle: HandoffBundle,
): Promise<{ id: string; expiresIn: number }> {
  if (!env.CACHE) throw new Error('handoff relay unavailable');
  // The offer must exist (recipient is waiting) — refuse stray bundles.
  const offer = await env.CACHE.get(offerKey(userId, id));
  if (!offer) throw new Error('no pending handoff');
  await env.CACHE.put(bundleKey(userId, id), JSON.stringify(bundle), { expirationTtl: TTL_SECONDS });
  return { id, expiresIn: TTL_SECONDS };
}

/**
 * Read + consume the bundle (one-time). Returns null while the sender
 * hasn't posted yet (recipient keeps polling) and deletes on first hit so
 * the encrypted snapshot never lingers in KV.
 */
export async function consumeHandoffBundle(
  env: HandoffEnv,
  userId: string,
  id: string,
): Promise<HandoffBundle | null> {
  if (!env.CACHE) throw new Error('handoff relay unavailable');
  const raw = await env.CACHE.get(bundleKey(userId, id));
  if (!raw) return null;
  await env.CACHE.delete(bundleKey(userId, id));
  await env.CACHE.delete(offerKey(userId, id));
  try {
    return validateHandoffBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}
