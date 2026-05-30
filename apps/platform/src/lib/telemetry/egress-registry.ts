/**
 * Telemetry-egress registry.
 *
 * Single source of truth for every channel by which Shippie's platform
 * sends data from a device to its own servers. Each channel registers
 * its endpoint, writer module, and a `mirror_fn` that produces a
 * Trust Ledger row.
 *
 * Spec: docs/superpowers/specs/2026-05-30-trust-ledger-5a-design.md §8.
 *
 * Enforcement:
 *   - `emitTelemetry(event)` is the only client-side path. Direct fetch
 *     or `navigator.sendBeacon` to a Shippie-egress endpoint is
 *     forbidden by `registry.test.ts`.
 *   - The wrapper router refuses to mount a handler under
 *     `lib/server/wrapper/router/` that writes to `analytics_events`
 *     unless it appears as a `writer_module` here.
 *   - Adding a new telemetry source = registry diff + extending the
 *     mirror; both enforced by lint + acceptance tests.
 */

import { ulid, redactTelemetryEvent, type LedgerRow, type TelemetrySource } from '@shippie/trust-ledger';
import { getLedger } from '$lib/trust-ledger/host';

export type TelemetryChannelId = TelemetrySource;

export type TelemetryCategory =
  | 'capability-counter'
  | 'product-telemetry'
  | 'install-attribution'
  | 'handoff-intent';

export interface TelemetryChannel {
  channel: TelemetryChannelId;
  /** Endpoint (full URL or path). Hostname extracted into the ledger row. */
  endpoint: string;
  /** Repo-relative writer module that owns the egress fetch. Used by lint. */
  writer_module: string;
  category: TelemetryCategory;
}

export interface TelemetryEvent {
  channel: TelemetryChannelId;
  event_name: string;
  /** Slug of the app for which the event was generated, or '__shippie_shell__' for platform-originated. */
  app?: string;
  payload_bytes: number;
  /** Hostname of the egress endpoint. Auto-derived from the channel when absent. */
  target_host?: string;
}

const SHELL_APP = '__shippie_shell__';

export const TELEMETRY_CHANNELS: readonly TelemetryChannel[] = Object.freeze([
  {
    channel: 'cloud-proof',
    endpoint: 'https://shippie.app/api/v1/proof',
    writer_module: 'packages/sdk/src/wrapper/proof.ts',
    category: 'capability-counter',
  },
  {
    channel: 'wrapper-analytics',
    endpoint: '/__shippie/analytics',
    writer_module: 'apps/platform/src/lib/server/wrapper/router/analytics.ts',
    category: 'product-telemetry',
  },
  {
    channel: 'shell-analytics',
    endpoint: '/__shippie/analytics?slug=__shippie_shell__',
    writer_module: 'apps/platform/src/lib/util/track.ts',
    category: 'product-telemetry',
  },
  {
    channel: 'beacon',
    endpoint: '/__shippie/beacon',
    writer_module: 'apps/platform/src/lib/server/wrapper/router/beacon.ts',
    category: 'product-telemetry',
  },
  {
    channel: 'install-attribution',
    endpoint: '/__shippie/install',
    writer_module: 'apps/platform/src/lib/server/wrapper/router/install.ts',
    category: 'install-attribution',
  },
  {
    channel: 'handoff',
    endpoint: '/__shippie/handoff',
    writer_module: 'apps/platform/src/lib/server/wrapper/router/handoff.ts',
    category: 'handoff-intent',
  },
]);

const CHANNELS_BY_ID = new Map(TELEMETRY_CHANNELS.map((c) => [c.channel, c]));

export function getChannel(id: TelemetryChannelId): TelemetryChannel {
  const c = CHANNELS_BY_ID.get(id);
  if (!c) throw new Error(`telemetry-egress: unknown channel '${id}'`);
  return c;
}

/**
 * Pure function: build the LedgerRow representing a telemetry-egress
 * event. Exported for tests + the lint suite to assert every channel
 * round-trips through the redactor cleanly.
 */
export function mirrorTelemetryToLedgerRow(event: TelemetryEvent): LedgerRow {
  const channel = getChannel(event.channel);
  const host = event.target_host ?? hostnameOfEndpoint(channel.endpoint);
  const redacted = redactTelemetryEvent({
    channel: event.channel,
    event_name: event.event_name,
    target_host: host,
    payload_bytes: event.payload_bytes,
  });
  return {
    id: ulid(),
    ts: Date.now(),
    app: event.app ?? SHELL_APP,
    capability: event.event_name,
    category: 'telemetry-egress',
    source: event.channel,
    summary: redacted.summary,
    target_host: redacted.target_host,
    bytes_out: redacted.bytes_out,
    outcome: 'ok',
  };
}

function hostnameOfEndpoint(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return 'shippie.app';
    }
  }
  // Relative path — hostname is the current origin.
  if (typeof globalThis.location?.hostname === 'string') {
    return globalThis.location.hostname;
  }
  return 'shippie.app';
}

/**
 * Mirror invariant: every telemetry event must land as a ledger row
 * before (or alongside) the egress fetch. If the ledger write fails,
 * the egress is dropped — we never send what we cannot log.
 *
 * Returns a `Result` object; callers can decide whether to retry or
 * silently drop. The shell's `track.ts` re-queues on failure.
 */
export interface EmitTelemetryResult {
  mirrored: boolean;
  reason?: 'ledger-unavailable' | 'ledger-failed' | 'idb-unavailable';
}

export async function emitTelemetry(event: TelemetryEvent): Promise<EmitTelemetryResult> {
  const row = mirrorTelemetryToLedgerRow(event);
  const ledger = await getLedger();
  if (!ledger) {
    return { mirrored: false, reason: 'idb-unavailable' };
  }
  try {
    await ledger.commit(row);
    return { mirrored: true };
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[telemetry] mirror failed; egress dropped', err);
    }
    return { mirrored: false, reason: 'ledger-failed' };
  }
}

/**
 * Single canonical client-side path for wrapper-analytics posts from
 * the container shell. Mirrors to the ledger, then fetches.
 *
 * The container's trackAnalytics handler calls this so all
 * showcase-iframe analytics traffic flows through one registry-
 * compliant entry. Direct fetch to /__shippie/analytics is forbidden
 * by the lint test.
 */
export interface WrapperAnalyticsPostResult {
  accepted: boolean;
  mirrored: boolean;
  status: number;
  body: unknown;
  reason?: EmitTelemetryResult['reason'] | 'network_error';
}

export async function postWrapperAnalyticsViaRegistry(
  slug: string,
  event: { event_name: string; properties?: Record<string, unknown>; ts?: number; url?: string; session_id?: string; user_id?: string },
): Promise<WrapperAnalyticsPostResult> {
  const payload = { events: [event] };
  const body = JSON.stringify(payload);
  const payload_bytes = new TextEncoder().encode(body).byteLength;
  const mirror = await emitTelemetry({
    channel: 'wrapper-analytics',
    event_name: event.event_name,
    app: slug,
    payload_bytes,
  });

  // Mirror invariant: if the ledger could not record this, don't send.
  if (!mirror.mirrored && mirror.reason !== 'idb-unavailable') {
    return {
      accepted: false,
      mirrored: false,
      status: 0,
      body: null,
      reason: mirror.reason,
    };
  }

  try {
    const res = await fetch(`/__shippie/analytics?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const respBody = (await res.json().catch(() => ({}))) as unknown;
    return {
      accepted: res.ok,
      mirrored: mirror.mirrored,
      status: res.status,
      body: respBody,
    };
  } catch (err) {
    return {
      accepted: false,
      mirrored: mirror.mirrored,
      status: 0,
      body: null,
      reason: 'network_error',
    };
  }
}
