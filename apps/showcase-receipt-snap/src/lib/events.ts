/**
 * Cross-app event payloads emitted by Receipt Snap.
 *
 * Why this file exists: the two intent broadcasts (`expense-logged`,
 * `dined-out`) are payload contracts shared with Ledger, Restaurant
 * Memory, and Atlas. Before the accounting widening they lived as
 * inline object-literal types in App.tsx. Pulling them here lets us:
 *   - lock the payload shape with a single type definition
 *   - reuse the type from tests + future consumers
 *   - keep `source` and `confidence` on the EVENT (per the plan review),
 *     not on every persisted Receipt row
 *
 * The event names themselves are NOT renamed. Ledger already consumes
 * `expense-logged`; Restaurant Memory + Atlas consume `dined-out`. Per
 * Codex's review: preserve those names. If a richer payload is ever
 * needed (e.g. tax breakdown), add a new `receipt-logged` event
 * alongside — don't break the existing two.
 */

/** Envelope shared across Shippie cross-app events. Receipt Snap fills
 *  this on broadcast; consumers can rely on `source` + `occurredAt`. */
export interface ShippieEventEnvelope {
  /** App identity. Always `'receipt-snap'` from this module. */
  source: 'receipt-snap';
  /** App version — handy for consumers that want to gate on payload
   *  shape changes. Optional; emitters fill if available. */
  appVersion?: string;
  /** ISO timestamp of when the event-relevant moment occurred (the
   *  receipt date, not the save timestamp). */
  occurredAt: string;
  /** OCR/AI confidence average, 0–1. Defaults to `1` for human-entered
   *  data. */
  confidence?: number;
}

/**
 * Payload for the `expense-logged` intent. Ledger consumes this.
 * Intentionally minimal — amount + when + where + category. No photo,
 * no raw OCR text. Adding optional accounting fields here later is
 * backwards-compatible (consumers ignore unknown keys).
 */
export interface ExpenseLoggedPayload {
  amount_cents: number;
  currency: string;
  category: string;
  vendor: string;
  occurred_on: string;
}

/**
 * Payload for the `dined-out` intent. Restaurant Memory and Atlas
 * consume this. Fires only when category implies a meal (food /
 * restaurant). Strictly a subset of `expense-logged` so consumers can
 * round-trip if both arrive.
 */
export interface DinedOutPayload {
  venue: string;
  occurred_on: string;
  amount_cents: number;
  currency: string;
}

/** Canonical event-name constants. Use these instead of string literals
 *  so a rename (which we won't be doing — see header) would catch at
 *  the type level. */
export const EVENT_EXPENSE_LOGGED = 'expense-logged' as const;
export const EVENT_DINED_OUT = 'dined-out' as const;
