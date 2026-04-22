/**
 * SDK error types.
 *
 * Most SDK methods either return a value, return null (the "no data"
 * case — e.g. not signed in), or throw a `ShippieSDKError`. The error
 * carries a machine-readable `code` so callers can distinguish "maker
 * forgot to call shippie.configure()" from "the backend responded 500".
 *
 * Previously the auth helpers caught everything and returned null,
 * which made "the user signed out" and "Supabase returned 500" look
 * identical in the caller's code. That ambiguity led to silent bugs.
 */

export type ShippieSDKErrorCode =
  | 'not_configured' // shippie.configure() was never called
  | 'signed_out' // explicit "no active session" signal (when a caller asks for the error instead of null)
  | 'backend_error'; // underlying backend (Supabase, Firebase) threw

export class ShippieSDKError extends Error {
  public readonly code: ShippieSDKErrorCode;
  public override readonly cause?: unknown;

  constructor(code: ShippieSDKErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ShippieSDKError';
    this.code = code;
    this.cause = cause;
  }
}

export function isShippieSDKError(err: unknown): err is ShippieSDKError {
  return err instanceof ShippieSDKError;
}
