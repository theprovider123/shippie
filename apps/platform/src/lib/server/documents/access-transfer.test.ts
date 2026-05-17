import { describe, expect, it } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  readAccessTransferRequest,
  readWrappedAccessBundle,
  storeAccessTransferRequest,
  storeWrappedAccessBundle,
  validateAccessTransferRequest,
  validateWrappedAccessBundle,
  type AccessTransferRequestPayload,
  type WrappedAccessBundleRelayPayload,
} from './access-transfer';

describe('document access transfer relay', () => {
  it('stores and reads wrapped access bundles without plaintext keys', async () => {
    const env = fakeEnv();
    const bundle = wrapped();
    await expect(storeWrappedAccessBundle(env, 'transfer_123', bundle)).resolves.toMatchObject({
      transferId: 'transfer_123',
      stored: true,
    });

    await expect(readWrappedAccessBundle(env, 'transfer_123')).resolves.toEqual(bundle);
    expect([...env.raw.values()].join('\n')).not.toContain('doc_counter');
    expect([...env.raw.values()].join('\n')).not.toContain('documentKey');
  });

  it('rejects plaintext fields on wrapped bundles', () => {
    expect(() => validateWrappedAccessBundle({ ...wrapped(), documentId: 'doc_counter' })).toThrow(/plaintext field/);
    expect(() => validateWrappedAccessBundle({ ...wrapped(), documentKey: 'secret' })).toThrow(/plaintext field/);
  });

  it('returns null when a stored wrapped bundle is malformed', async () => {
    const env = fakeEnv();
    await env.CACHE.put('documents:v0:transfer:transfer_bad', JSON.stringify({ schema: 'bad' }));
    await expect(readWrappedAccessBundle(env, 'transfer_bad')).resolves.toBeNull();
  });

  it('stores receiver public-key requests separately from wrapped bundles', async () => {
    const env = fakeEnv();
    const request = transferRequest();
    await expect(storeAccessTransferRequest(env, 'transfer_123', request)).resolves.toMatchObject({
      transferId: 'transfer_123',
      stored: true,
    });

    await expect(readAccessTransferRequest(env, 'transfer_123')).resolves.toEqual(request);
    expect(await readWrappedAccessBundle(env, 'transfer_123')).toBeNull();
  });

  it('rejects raw document fields on transfer requests', () => {
    expect(() => validateAccessTransferRequest({ ...transferRequest(), documentKey: 'secret' })).toThrow(/plaintext field/);
    expect(() => validateAccessTransferRequest({ ...transferRequest(), documents: [] })).toThrow(/plaintext field/);
  });
});

function wrapped(): WrappedAccessBundleRelayPayload {
  return {
    schema: 'shippie.document.wrapped-access-bundle.v1',
    alg: 'ECDH-P256-AES-256-GCM',
    senderPublicKey: 'sender_pub',
    nonce: 'nonce',
    ciphertext: 'ciphertext',
  };
}

function transferRequest(): AccessTransferRequestPayload {
  return {
    schema: 'shippie.document.access-transfer-request.v1',
    recipientPublicKey: 'recipient_pub',
    createdAt: '2026-05-11T12:00:00.000Z',
    deviceLabel: 'New phone',
  };
}

function fakeEnv(): { CACHE: KVNamespace; raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    CACHE: {
      async get(key: string) {
        return raw.get(key) ?? null;
      },
      async put(key: string, value: string) {
        raw.set(key, value);
      },
    } as unknown as KVNamespace,
  };
}
