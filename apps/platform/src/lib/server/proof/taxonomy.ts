/**
 * Canonical taxonomy for runtime proof events + the rules that map them
 * to Capability Proof Badges.
 *
 * The wrapper is the only legitimate emitter; makers don't write proof
 * events directly. The ingestion endpoint validates incoming events
 * against `PROOF_EVENT_TYPES` and rejects anything else — this prevents
 * a maker from forging "uses-local-ai" without actually doing inference.
 *
 * Adding an event:
 *   1. Append to `PROOF_EVENT_TYPES`.
 *   2. If it should contribute to a badge, list it under
 *      `BADGE_RULES[<badge>].events`.
 *   3. Decide the threshold (distinct device hashes in the window).
 *
 * Badge thresholds default to 3 distinct devices in 30 days. Lower than
 * an enterprise SOC threshold deliberately — at this stage, three
 * independent phones agreeing on a runtime fact is a strong signal.
 */

export const PROOF_EVENT_TYPES = [
  'installed',
  'service_worker_active',
  'offline_loaded',
  'local_db_used',
  'data_exported',
  'ai_ran_local',
  'model_cached',
  'room_joined',
  'peer_synced',
  'backup_written',
  'backup_restored',
  'device_transferred',
  'permissions_scanned',
  'external_domains_shown',
  'permission_diff_surfaced',
] as const;

export type ProofEventType = (typeof PROOF_EVENT_TYPES)[number];

export function isProofEventType(value: unknown): value is ProofEventType {
  return typeof value === 'string' && (PROOF_EVENT_TYPES as readonly string[]).includes(value);
}

export const CAPABILITY_BADGES = [
  'works-offline',
  'runs-local-db',
  'uses-local-ai',
  'mesh-ready',
  'data-export-verified',
  'backup-restore-verified',
  'device-transfer-verified',
] as const;

export type CapabilityBadge = (typeof CAPABILITY_BADGES)[number];

export interface BadgeRule {
  /** Plain-language description for the maker dashboard. */
  description: string;
  /** Events that, if all observed from ≥ threshold devices, award the badge. */
  events: ProofEventType[];
  /** Minimum distinct device hashes required to award. */
  threshold: number;
  /** Lookback window for distinct-device counting. */
  windowDays: number;
}

export const BADGE_RULES: Record<CapabilityBadge, BadgeRule> = {
  'works-offline': {
    description: 'Service worker is active AND the app served at least one request offline.',
    events: ['service_worker_active', 'offline_loaded'],
    threshold: 3,
    windowDays: 30,
  },
  'runs-local-db': {
    description: 'Local SQLite (wa-sqlite + OPFS) was used to read or write app data.',
    events: ['local_db_used'],
    threshold: 3,
    windowDays: 30,
  },
  'uses-local-ai': {
    description: 'A local AI model ran inference on the device (cached + ran).',
    events: ['ai_ran_local'],
    threshold: 3,
    windowDays: 30,
  },
  'mesh-ready': {
    description: 'A Connect room was joined AND a CRDT peer sync succeeded.',
    events: ['room_joined', 'peer_synced'],
    threshold: 3,
    windowDays: 30,
  },
  'data-export-verified': {
    description: 'A user successfully exported their data via the Your Data panel.',
    events: ['data_exported'],
    threshold: 3,
    windowDays: 30,
  },
  'backup-restore-verified': {
    description: 'A user successfully restored from an encrypted cloud backup.',
    events: ['backup_restored'],
    threshold: 3,
    windowDays: 30,
  },
  'device-transfer-verified': {
    description: 'Phone-to-phone transfer completed at least once.',
    events: ['device_transferred'],
    threshold: 3,
    windowDays: 30,
  },
};
