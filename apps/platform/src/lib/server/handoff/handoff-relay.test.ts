import { describe, expect, test } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  consumeHandoffBundle,
  HANDOFF_BUNDLE_SCHEMA,
  HANDOFF_OFFER_SCHEMA,
  isHandoffId,
  newHandoffId,
  readHandoffOffer,
  storeHandoffBundle,
  storeHandoffOffer,
  validateHandoffBundle,
  validateHandoffOffer,
  type HandoffBundle,
  type HandoffEnv,
  type HandoffOffer,
} from './handoff-relay';

function fakeKv(seed: Record<string, string> = {}): { CACHE: KVNamespace } {
  const store = { ...seed };
  return {
    CACHE: {
      get: async (k: string) => store[k] ?? null,
      put: async (k: string, v: string) => { store[k] = v; },
      delete: async (k: string) => { delete store[k]; },
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    } as unknown as KVNamespace,
  };
}

const offer: HandoffOffer = {
  schema: HANDOFF_OFFER_SCHEMA,
  recipientPublicKey: 'recipientPubKey',
  appSlug: 'palate',
  deviceLabel: 'Laptop',
  createdAt: '2026-06-13T00:00:00Z',
};
const bundle: HandoffBundle = {
  schema: HANDOFF_BUNDLE_SCHEMA,
  alg: 'ECDH-P256-AES-256-GCM',
  senderPublicKey: 'senderPubKey',
  nonce: 'nonce',
  ciphertext: 'cipher',
};

describe('handoff relay', () => {
  test('ids are well-formed and validated', () => {
    const id = newHandoffId();
    expect(isHandoffId(id)).toBe(true);
    expect(isHandoffId('short')).toBe(false);
    expect(isHandoffId('has spaces and is long enough zzzzz')).toBe(false);
  });

  test('offer round-trips for the owning account', async () => {
    const env = fakeKv();
    await storeHandoffOffer(env, 'user-1', 'id-aaaaaaaaaaaaaaaa', offer);
    expect(await readHandoffOffer(env, 'user-1', 'id-aaaaaaaaaaaaaaaa')).toEqual(offer);
  });

  test('a different account cannot read the offer (namespaced by userId)', async () => {
    const env = fakeKv();
    await storeHandoffOffer(env, 'user-1', 'id-aaaaaaaaaaaaaaaa', offer);
    expect(await readHandoffOffer(env, 'user-2', 'id-aaaaaaaaaaaaaaaa')).toBeNull();
  });

  test('bundle requires a pending offer', async () => {
    const env = fakeKv();
    await expect(storeHandoffBundle(env, 'user-1', 'id-aaaaaaaaaaaaaaaa', bundle)).rejects.toThrow(
      /no pending/,
    );
  });

  test('bundle is consumed one-time and clears the offer', async () => {
    const env = fakeKv();
    await storeHandoffOffer(env, 'user-1', 'id-aaaaaaaaaaaaaaaa', offer);
    await storeHandoffBundle(env, 'user-1', 'id-aaaaaaaaaaaaaaaa', bundle);

    const first = await consumeHandoffBundle(env, 'user-1', 'id-aaaaaaaaaaaaaaaa');
    expect(first).toEqual(bundle);
    // Second read is empty (deleted), and the offer is gone too.
    expect(await consumeHandoffBundle(env, 'user-1', 'id-aaaaaaaaaaaaaaaa')).toBeNull();
    expect(await readHandoffOffer(env, 'user-1', 'id-aaaaaaaaaaaaaaaa')).toBeNull();
  });

  test('validators reject malformed shapes + stray fields', () => {
    expect(() => validateHandoffOffer({ ...offer, evil: 1 })).toThrow(/unexpected field/);
    expect(() => validateHandoffOffer({ ...offer, appSlug: 'Bad Slug' })).toThrow(/invalid app slug/);
    expect(() => validateHandoffOffer({ ...offer, schema: 'nope' })).toThrow(/schema/);
    expect(() => validateHandoffBundle({ ...bundle, alg: 'rot13' })).toThrow(/algorithm/);
    expect(() => validateHandoffBundle({ ...bundle, senderPublicKey: 123 })).toThrow(/public key/);
  });
});
