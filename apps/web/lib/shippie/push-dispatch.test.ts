import { describe, expect, test } from 'bun:test';
import { dispatchPush } from './push-dispatch.ts';
import { p256 } from '@noble/curves/nist.js';

describe('dispatchPush', () => {
  test('returns vapid_not_configured when env vars absent', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_SUBJECT;
    const r = await dispatchPush(
      { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } },
      { title: 't', body: 'b' },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('vapid_not_configured');
  });

  test('POSTs to endpoint with aes128gcm encoding and vapid Authorization', async () => {
    const { publicKey, secretKey } = p256.keygen();
    process.env.VAPID_PRIVATE_KEY = Buffer.from(secretKey).toString('base64url');
    process.env.VAPID_PUBLIC_KEY = Buffer.from(publicKey).toString('base64url');
    process.env.VAPID_SUBJECT = 'mailto:ops@shippie.app';

    const { publicKey: uaPub } = p256.keygen();
    const auth = new Uint8Array(16);
    crypto.getRandomValues(auth);

    let captured: { url: string; headers: Headers; body: BodyInit | null | undefined } | null = null;
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      captured = {
        url:
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url,
        headers: new Headers(init?.headers ?? {}),
        body: init?.body,
      };
      return new Response(null, { status: 201 });
    }) as typeof globalThis.fetch;

    try {
      const r = await dispatchPush(
        {
          endpoint: 'https://push.example/abc',
          keys: {
            p256dh: Buffer.from(uaPub).toString('base64url'),
            auth: Buffer.from(auth).toString('base64url'),
          },
        },
        { title: 'Ship', body: 'ped' },
      );
      expect(r.ok).toBe(true);
      expect(r.status).toBe(201);
      expect(captured).not.toBeNull();
      const h = captured!.headers;
      expect(h.get('content-encoding')).toBe('aes128gcm');
      expect(h.get('authorization')?.startsWith('vapid t=')).toBe(true);
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }
  });

  test('returns gone on 410', async () => {
    const { publicKey, secretKey } = p256.keygen();
    process.env.VAPID_PRIVATE_KEY = Buffer.from(secretKey).toString('base64url');
    process.env.VAPID_PUBLIC_KEY = Buffer.from(publicKey).toString('base64url');
    process.env.VAPID_SUBJECT = 'mailto:ops@shippie.app';

    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = (async () =>
      new Response(null, { status: 410 })) as typeof globalThis.fetch;
    try {
      const { publicKey: uaPub } = p256.keygen();
      const r = await dispatchPush(
        {
          endpoint: 'https://push.example/abc',
          keys: {
            p256dh: Buffer.from(uaPub).toString('base64url'),
            auth: Buffer.from(new Uint8Array(16)).toString('base64url'),
          },
        },
        { title: 't', body: 'b' },
      );
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('gone');
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }
  });
});
