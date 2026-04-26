/**
 * Convert a Uint8Array to an ArrayBuffer that TypeScript considers
 * a valid BodyInit for the Response constructor.
 *
 * Ported from services/worker/src/bytes.ts.
 */
export function toResponseBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
