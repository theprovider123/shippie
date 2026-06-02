import type { KVNamespace } from '@cloudflare/workers-types';

export const WRAPPED_ACCESS_BUNDLE_SCHEMA = 'shippie.document.wrapped-access-bundle.v1';
export const ACCESS_TRANSFER_REQUEST_SCHEMA = 'shippie.document.access-transfer-request.v1';

export interface WrappedAccessBundleRelayPayload {
  schema: typeof WRAPPED_ACCESS_BUNDLE_SCHEMA;
  alg: 'ECDH-P256-AES-256-GCM';
  senderPublicKey: string;
  nonce: string;
  ciphertext: string;
}

export interface AccessTransferRequestPayload {
  schema: typeof ACCESS_TRANSFER_REQUEST_SCHEMA;
  recipientPublicKey: string;
  createdAt: string;
  deviceLabel?: string;
}

export interface AccessTransferEnv {
  CACHE?: KVNamespace;
  SEALED_DOCS_ENABLED?: string;
}

const TRANSFER_ID_RE = /^[A-Za-z0-9_-]{8,120}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,500000}$/;
const TRANSFER_TTL_SECONDS = 10 * 60;
const MAX_WRAPPED_BUNDLE_BYTES = 512 * 1024;
const WRAPPED_KEYS = new Set(['schema', 'alg', 'senderPublicKey', 'nonce', 'ciphertext']);
const REQUEST_KEYS = new Set(['schema', 'recipientPublicKey', 'createdAt', 'deviceLabel']);

export function assertTransferId(value: string): void {
  if (!TRANSFER_ID_RE.test(value)) throw new Error('invalid transfer id');
}

export async function parseWrappedAccessBundleRequest(request: Request): Promise<WrappedAccessBundleRelayPayload> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_WRAPPED_BUNDLE_BYTES) throw new Error('wrapped bundle too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_WRAPPED_BUNDLE_BYTES) {
    throw new Error('wrapped bundle too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateWrappedAccessBundle(parsed);
}

export async function parseAccessTransferRequest(request: Request): Promise<AccessTransferRequestPayload> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_WRAPPED_BUNDLE_BYTES) throw new Error('transfer request too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_WRAPPED_BUNDLE_BYTES) {
    throw new Error('transfer request too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid json');
  }
  return validateAccessTransferRequest(parsed);
}

export function validateWrappedAccessBundle(value: unknown): WrappedAccessBundleRelayPayload {
  if (!value || typeof value !== 'object') throw new Error('wrapped bundle must be an object');
  for (const key of Object.keys(value)) {
    if (!WRAPPED_KEYS.has(key)) throw new Error(`unexpected plaintext field: ${key}`);
  }
  const bundle = value as Partial<WrappedAccessBundleRelayPayload>;
  if (bundle.schema !== WRAPPED_ACCESS_BUNDLE_SCHEMA) throw new Error('unsupported wrapped bundle schema');
  if (bundle.alg !== 'ECDH-P256-AES-256-GCM') throw new Error('unsupported wrapped bundle algorithm');
  if (!isToken(bundle.senderPublicKey)) throw new Error('invalid sender public key');
  if (!isToken(bundle.nonce)) throw new Error('invalid nonce');
  if (!isToken(bundle.ciphertext)) throw new Error('invalid ciphertext');
  return {
    schema: bundle.schema,
    alg: bundle.alg,
    senderPublicKey: bundle.senderPublicKey,
    nonce: bundle.nonce,
    ciphertext: bundle.ciphertext,
  };
}

export function validateAccessTransferRequest(value: unknown): AccessTransferRequestPayload {
  if (!value || typeof value !== 'object') throw new Error('transfer request must be an object');
  for (const key of Object.keys(value)) {
    if (!REQUEST_KEYS.has(key)) throw new Error(`unexpected plaintext field: ${key}`);
  }
  const request = value as Partial<AccessTransferRequestPayload>;
  if (request.schema !== ACCESS_TRANSFER_REQUEST_SCHEMA) throw new Error('unsupported transfer request schema');
  if (!isToken(request.recipientPublicKey)) throw new Error('invalid recipient public key');
  if (typeof request.createdAt !== 'string' || Number.isNaN(Date.parse(request.createdAt))) {
    throw new Error('invalid created-at');
  }
  if (request.deviceLabel != null && (typeof request.deviceLabel !== 'string' || request.deviceLabel.length > 120)) {
    throw new Error('invalid device label');
  }
  return {
    schema: request.schema,
    recipientPublicKey: request.recipientPublicKey,
    createdAt: request.createdAt,
    deviceLabel: request.deviceLabel,
  };
}

export async function storeAccessTransferRequest(
  env: AccessTransferEnv,
  transferId: string,
  request: AccessTransferRequestPayload,
): Promise<{ transferId: string; stored: true; expiresIn: number }> {
  assertTransferId(transferId);
  ensureAccessTransferEnabled(env);
  if (!env.CACHE) throw new Error('access transfer relay unavailable');
  const key = transferRequestKey(transferId);
  const existing = await env.CACHE.get(key);
  if (existing) {
    const claimed = validateAccessTransferRequest(JSON.parse(existing));
    if (claimed.recipientPublicKey !== request.recipientPublicKey) {
      throw new Error('access transfer already claimed');
    }
  }
  await env.CACHE.put(key, JSON.stringify(request), { expirationTtl: TRANSFER_TTL_SECONDS });
  return { transferId, stored: true, expiresIn: TRANSFER_TTL_SECONDS };
}

export async function readAccessTransferRequest(
  env: AccessTransferEnv,
  transferId: string,
): Promise<AccessTransferRequestPayload | null> {
  assertTransferId(transferId);
  ensureAccessTransferEnabled(env);
  if (!env.CACHE) throw new Error('access transfer relay unavailable');
  const raw = await env.CACHE.get(transferRequestKey(transferId));
  if (!raw) return null;
  try {
    return validateAccessTransferRequest(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function storeWrappedAccessBundle(
  env: AccessTransferEnv,
  transferId: string,
  bundle: WrappedAccessBundleRelayPayload,
): Promise<{ transferId: string; stored: true; expiresIn: number }> {
  assertTransferId(transferId);
  ensureAccessTransferEnabled(env);
  if (!env.CACHE) throw new Error('access transfer relay unavailable');
  await env.CACHE.put(transferKey(transferId), JSON.stringify(bundle), { expirationTtl: TRANSFER_TTL_SECONDS });
  return { transferId, stored: true, expiresIn: TRANSFER_TTL_SECONDS };
}

export async function readWrappedAccessBundle(
  env: AccessTransferEnv,
  transferId: string,
): Promise<WrappedAccessBundleRelayPayload | null> {
  assertTransferId(transferId);
  ensureAccessTransferEnabled(env);
  if (!env.CACHE) throw new Error('access transfer relay unavailable');
  const raw = await env.CACHE.get(transferKey(transferId));
  if (!raw) return null;
  try {
    return validateWrappedAccessBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

function transferKey(transferId: string): string {
  return `documents:v0:transfer:${transferId}`;
}

function transferRequestKey(transferId: string): string {
  return `documents:v0:transfer-request:${transferId}`;
}

function ensureAccessTransferEnabled(env: AccessTransferEnv): void {
  if (env.SEALED_DOCS_ENABLED === 'false') throw new Error('access transfer relay unavailable');
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}
