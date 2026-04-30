/**
 * @shippie/share — local-anonymous content sharing.
 *
 * Public surface:
 *   - packBlob / signBlob / verifyBlob — the wire format + crypto
 *   - buildShareUrl / readImportFragment — URL-fragment plumbing
 *   - getOrCreateDeviceKey / getDeviceName — author identity
 *   - hashCanonical — content-addressed lineage
 *
 * High-level helper exposed for showcase consumers:
 *   - createSignedBlob({ type, payload, parent_hash? })
 *
 * The package is framework-neutral; consumers can render the result
 * via @shippie/qr (single-frame QR), navigator.share, or just copy
 * the URL.
 */

export type {
  ShareBlob,
  ShareAuthor,
  ShareLineage,
  UnsignedBlob,
  VerifyResult,
} from './blob.ts';

export {
  canonicalize,
  hashCanonical,
  signBlob,
  verifyBlob,
  bytesToBase64url,
  base64urlToBytes,
} from './blob.ts';

export {
  encodeBlobToFragment,
  decodeFragmentToBlob,
  buildShareUrl,
  readImportFragment,
  clearImportFragment,
  fragmentFitsInQr,
  MAX_FRAGMENT_BYTES,
} from './url.ts';

export {
  getOrCreateDeviceKey,
  getDeviceName,
  setDeviceName,
  type DeviceKey,
} from './pubkey.ts';

import {
  signBlob as _signBlob,
  type ShareBlob,
  type UnsignedBlob,
} from './blob.ts';
import { getOrCreateDeviceKey, getDeviceName } from './pubkey.ts';

/**
 * Convenience: build a signed blob using the device key. The author
 * field is filled from `getDeviceName()` and the device pubkey.
 */
export async function createSignedBlob<TPayload>(input: {
  type: string;
  payload: TPayload;
  parent_hash?: string;
  based_on?: string;
}): Promise<ShareBlob<TPayload>> {
  const key = await getOrCreateDeviceKey();
  const unsigned: UnsignedBlob<TPayload> = {
    v: 1,
    type: input.type,
    payload: input.payload,
    author: { pubkey: key.pubkey, name: getDeviceName() },
    created_at: Date.now(),
    ...(input.parent_hash || input.based_on
      ? {
          lineage: {
            ...(input.parent_hash ? { parent_hash: input.parent_hash } : {}),
            ...(input.based_on ? { based_on: input.based_on } : {}),
          },
        }
      : {}),
  };
  return _signBlob(unsigned, key.privateKey) as Promise<ShareBlob<TPayload>>;
}
