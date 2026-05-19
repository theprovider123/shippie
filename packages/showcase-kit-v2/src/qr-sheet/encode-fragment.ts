import {
  createSignedBlob,
  encodeBlobToFragment,
  decodeFragmentToBlob,
  verifyBlob,
  type ShareBlob,
  type VerifyResult,
} from '@shippie/share';

/**
 * Sign + encode a payload into a URL-fragment-safe string. Returns the
 * fragment portion only — consumers can append it to their base URL via
 * `${base}#${fragment}` or use `@shippie/share`'s `buildShareUrl`.
 */
export async function encodeShareFragment<T>(input: {
  type: string;
  payload: T;
  parent_hash?: string;
}): Promise<string> {
  const blob = await createSignedBlob<T>(input);
  return encodeBlobToFragment(blob);
}

/**
 * Decode a fragment back into a verified payload. Returns `null` if
 * verification fails (tamper, bad signature, malformed). The blob's
 * payload field is `unknown` — narrow it at the call site after checking
 * the `type` discriminator.
 */
export async function decodeShareFragment(
  fragment: string,
): Promise<{ blob: ShareBlob; verify: VerifyResult } | null> {
  try {
    const blob = await decodeFragmentToBlob(fragment);
    const verify = await verifyBlob(blob);
    return { blob, verify };
  } catch {
    return null;
  }
}
