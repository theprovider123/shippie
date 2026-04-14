/**
 * Convert a Uint8Array to an ArrayBuffer that TypeScript considers
 * a valid BodyInit for the Response constructor. TS 5.7+ tightened
 * the typing of Uint8Array to include generic ArrayBufferLike, which
 * no longer narrows to BodyInit.
 *
 * This helper slices the underlying buffer at the exact view range so
 * callers always get a detached, self-contained ArrayBuffer.
 */
export function toResponseBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
