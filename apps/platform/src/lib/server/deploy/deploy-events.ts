/**
 * Deploy event spine — Phase 3.
 *
 * Each event captures one inflection point in the deploy pipeline.
 * Events are:
 *   - Discriminated by `type`. Adding a new event = adding a new
 *     variant. Old consumers ignore unknown types.
 *   - Time-stamped at emit (millisecond precision).
 *   - Self-contained — every event is meaningful on its own. No
 *     "see previous event" coupling.
 *   - Content-addressable as a stream — replaying the events.ndjson
 *     reproduces the dashboard view bit-for-bit.
 *
 * The spine is consumed by:
 *   - The dashboard /dashboard/deploys/[id] page (renders sequentially)
 *   - /api/deploy/[id]/stream (SSE; tails the NDJSON live, replays for
 *     post-hoc views)
 *   - MCP `shippie_deploy` (pretty-prints in Claude Code tool output)
 *   - Future Hub mirror (Phase 9 — same NDJSON, served locally)
 */

export type DeployEvent =
  | DeployReceivedEvent
  | FrameworkDetectedEvent
  | SecurityScanStartedEvent
  | SecretDetectedEvent
  | SecurityScanFinishedEvent
  | PrivacyAuditFinishedEvent
  | KindClassifiedEvent
  | AssetFixedEvent
  | EssentialsInjectedEvent
  | UploadStartedEvent
  | UploadFinishedEvent
  | HealthCheckFinishedEvent
  | DeployLiveEvent
  | DeployFailedEvent;

interface BaseEvent {
  /** ISO timestamp when the event was emitted. */
  ts: string;
  /** ms since the deploy started. Lets a static replay show real timings. */
  elapsedMs: number;
}

export interface DeployReceivedEvent extends BaseEvent {
  type: 'deploy_received';
  slug: string;
  version: number;
  bytes: number;
  files: number;
}

export interface FrameworkDetectedEvent extends BaseEvent {
  type: 'framework_detected';
  /** Best-effort label: react+vite | next-static | sveltekit-static |
   *  expo-export | plain-html | unknown. */
  framework: string;
  /** Where index.html was found. */
  indexPath: string;
}

export interface SecurityScanStartedEvent extends BaseEvent {
  type: 'security_scan_started';
  filesToScan: number;
}

export interface SecretDetectedEvent extends BaseEvent {
  type: 'secret_detected';
  rule: string;
  severity: 'block' | 'warn' | 'info';
  location: string;
  /** Heavily-redacted snippet — never the full secret. */
  redacted: string;
  reason: string;
}

export interface SecurityScanFinishedEvent extends BaseEvent {
  type: 'security_scan_finished';
  blocks: number;
  warns: number;
  infos: number;
}

export interface PrivacyAuditFinishedEvent extends BaseEvent {
  type: 'privacy_audit_finished';
  trackers: number;
  unknown: number;
  feature: number;
  cdn: number;
}

export interface KindClassifiedEvent extends BaseEvent {
  type: 'kind_classified';
  detected: string;
  declared?: string;
  publicKind: string;
  publicStatus: string;
  confidence: number;
  reasons: string[];
}

export interface AssetFixedEvent extends BaseEvent {
  type: 'asset_fixed';
  /** What was changed — broken_path | http_to_https | injected_meta. */
  kind: string;
  before: string;
  after: string;
  file: string;
}

export interface EssentialsInjectedEvent extends BaseEvent {
  type: 'essentials_injected';
  injected: string[];
}

export interface UploadStartedEvent extends BaseEvent {
  type: 'upload_started';
  files: number;
  bytes: number;
}

export interface UploadFinishedEvent extends BaseEvent {
  type: 'upload_finished';
  files: number;
  bytes: number;
}

export interface HealthCheckFinishedEvent extends BaseEvent {
  type: 'health_check_finished';
  passed: boolean;
  warnings: number;
  failures: number;
}

export interface DeployLiveEvent extends BaseEvent {
  type: 'deploy_live';
  liveUrl: string;
  durationMs: number;
}

export interface DeployFailedEvent extends BaseEvent {
  type: 'deploy_failed';
  reason: string;
  step: string;
}

/**
 * Distribute Omit over the discriminated union so callers retain
 * variant-specific field type-checking on the emit() argument.
 */
export type DeployEventInput = DeployEvent extends infer E
  ? E extends DeployEvent
    ? Omit<E, 'ts' | 'elapsedMs'>
    : never
  : never;

/**
 * Buffered emitter — appends events into an array. Pipeline runs
 * synchronously today, so we collect all events and flush to R2 at the
 * end as NDJSON. When the pipeline goes async (Phase 9 multi-step Hub),
 * a streaming emitter can replace this with a writeable R2 multipart
 * upload without changing call sites.
 */
export interface DeployEventEmitter {
  emit(event: DeployEventInput): void;
  events(): readonly DeployEvent[];
  /** ms since the emitter was created. Drives `elapsedMs` on each event. */
  elapsedMs(): number;
}

export function createEventEmitter(startedAtMs: number): DeployEventEmitter {
  const events: DeployEvent[] = [];
  return {
    emit(partial) {
      const event = {
        ...partial,
        ts: new Date().toISOString(),
        elapsedMs: Date.now() - startedAtMs,
      } as DeployEvent;
      events.push(event);
    },
    events() {
      return events;
    },
    elapsedMs() {
      return Date.now() - startedAtMs;
    },
  };
}

/**
 * Serialize events as NDJSON — one event per line. Stable format that
 * tails cleanly and replays faithfully.
 */
export function serializeEventsNdjson(events: readonly DeployEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/**
 * R2 key for the events stream of a given deploy. Lives next to the
 * deploy report under the `_shippie/` reserved prefix.
 */
export function deployEventsKey(slug: string, version: number): string {
  return `apps/${slug}/v${version}/_shippie/events.ndjson`;
}
