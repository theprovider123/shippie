import { beforeEach, describe, expect, test } from 'bun:test';
import type { NextRequest } from 'next/server';
import { signWorkerRequest } from '@shippie/session-crypto';
import { verifyInternalRequest } from './signed-request';

function mockRequest(
  path: string,
  headers: HeadersInit,
  method = 'POST',
): NextRequest {
  return {
    url: `https://shippie.app${path}`,
    method,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

describe('verifyInternalRequest', () => {
  const secret = 'worker-platform-secret-123';
  const body = JSON.stringify({ hello: 'world' });
  const path = '/api/internal/sdk/feedback';

  beforeEach(() => {
    process.env.WORKER_PLATFORM_SECRET = secret;
  });

  test('accepts a valid signature', async () => {
    const signed = await signWorkerRequest(secret, 'POST', path, body);

    await expect(
      verifyInternalRequest(
        mockRequest(path, {
          'x-shippie-signature': signed.signature,
          'x-shippie-timestamp': signed.timestamp,
        }),
        body,
      ),
    ).resolves.toBeUndefined();
  });

  test('rejects missing signature headers', async () => {
    await expect(verifyInternalRequest(mockRequest(path, {}), body)).rejects.toThrow(
      'missing signature headers',
    );
  });

  test('rejects an invalid signature', async () => {
    await expect(
      verifyInternalRequest(
        mockRequest(path, {
          'x-shippie-signature': 'bad-signature',
          'x-shippie-timestamp': Date.now().toString(),
        }),
        body,
      ),
    ).rejects.toThrow('signature mismatch');
  });
});
