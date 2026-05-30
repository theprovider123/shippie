/**
 * Trust Ledger row schema.
 *
 * One row per capability call OR per outgoing telemetry event. Stored
 * on-device in an encrypted envelope; the redactor (`redact.ts`)
 * guarantees no payload body bytes ever cross into a row.
 */

export type LedgerCategory = 'capability' | 'telemetry-egress' | 'ledger-internal';

export type LedgerOutcome = 'ok' | 'fail-closed' | 'fail-open-degraded' | 'denied';

export type LedgerEgressVisibility = 'full' | 'bridge-only';

export type TelemetrySource =
  | 'cloud-proof'
  | 'shell-analytics'
  | 'wrapper-analytics'
  | 'beacon'
  | 'install-attribution'
  | 'handoff';

export interface LedgerRow {
  /** ULID — sortable by time, collision-resistant. */
  id: string;
  /** ms since epoch, client clock at the call site. */
  ts: number;
  /** app slug; `__shippie_shell__` for platform-originated events. */
  app: string;
  /**
   * Capability name for `category: 'capability'` (`intent.provide`,
   * `network.fetch`, etc.) or the canonical event name for
   * `category: 'telemetry-egress'` / `'ledger-internal'`.
   */
  capability: string;
  category: LedgerCategory;
  /** For `telemetry-egress`: which Shippie telemetry channel produced this. */
  source?: TelemetrySource;
  /** Human-readable redacted summary, ≤120 chars, never carries body bytes. */
  summary: string;
  /** Hostname of the egress target; never includes path or query. */
  target_host?: string;
  /** Response/payload bytes received. */
  bytes_in?: number;
  /** Request/payload bytes sent. */
  bytes_out?: number;
  /**
   * `full` for showcases running on a Shippie-controlled runtime
   * (`/__shippie-run/<slug>/`). `bridge-only` for URL-installed or
   * custom-domain apps — direct iframe egress is not enumerable.
   */
  egress_visibility?: LedgerEgressVisibility;
  /**
   * Whether the call succeeded, failed closed, completed via the
   * fail-open allow-list, or was denied by capability gates.
   */
  outcome: LedgerOutcome;
}

/**
 * On-disk encrypted envelope. Only `id`, `ts_bucket`, `iv`, and
 * `key_id` are clear so retention sweeps and key-rotation cycles can
 * operate without decrypting every row.
 */
export interface EncryptedLedgerRow {
  id: string;
  /** floor(ts / 3_600_000) — supports retention sweep without decrypt. */
  ts_bucket: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  key_id: string;
}

/**
 * Wraps a non-extractable AES-GCM key with a stable id so old rows can
 * still decrypt under a previous key generation during rotation.
 */
export interface LedgerKey {
  readonly id: string;
  readonly key: CryptoKey;
}
