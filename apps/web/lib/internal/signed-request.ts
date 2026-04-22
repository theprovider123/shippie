/**
 * HMAC verification for Worker → Platform /api/internal/* requests.
 *
 * Incoming requests from the Cloudflare Worker (or local dev server)
 * carry two headers:
 *
 *   X-Shippie-Signature: HMAC_SHA256(secret, METHOD\nPATH\nBODY_HASH\nTIMESTAMP)
 *   X-Shippie-Timestamp: unix ms
 *
 * The signing helper lives in @shippie/session-crypto and is shared
 * with the worker so both sides sign the same canonical input.
 *
 * Spec v6 §6.3.
 */
import type { NextRequest } from 'next/server';
import { verifyWorkerRequest } from '@shippie/session-crypto';

function getSecret(): string {
  const secret = process.env.WORKER_PLATFORM_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'WORKER_PLATFORM_SECRET is unset or too short (min 16 chars). ' +
        'Set it in .env.local to the same value as the worker.',
    );
  }
  return secret;
}

export async function verifyInternalRequest(
  req: NextRequest,
  rawBody: string,
): Promise<void> {
  const signature = req.headers.get('x-shippie-signature');
  const timestamp = req.headers.get('x-shippie-timestamp');

  if (!signature || !timestamp) {
    throw new Error('missing signature headers');
  }

  const url = new URL(req.url);
  const path = url.pathname + url.search;

  const verified = await verifyWorkerRequest(
    getSecret(),
    req.method,
    path,
    rawBody,
    signature,
    timestamp,
  );
  if (!verified.ok) {
    throw new Error(verified.reason);
  }
}
