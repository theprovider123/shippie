/**
 * Platform-shell client-side analytics helper.
 *
 * Posts batched events to /__shippie/analytics?slug=__shippie_shell__.
 * The shell-app row seeded by migration 0034 (with runtime self-heal in
 * `lib/util/shippie-shell.ts`) lets the existing wrapper analytics
 * endpoint FK shell-originated events into analytics_events without
 * making any column nullable.
 *
 * Payload shape MUST match handleAnalytics's normalize():
 *   { events: [{ event_name, properties, session_id?, url?, ts? }] }
 * NOT { name, props } — the normalize function would drop those.
 *
 * Survives offline via navigator.sendBeacon fallback on page-hide.
 * Re-queues on non-2xx responses (404 unknown_app, 429 rate_limited,
 * 500 insert_failed all reach the !res.ok branch without throwing,
 * which would otherwise lose telemetry silently).
 *
 * Trust Ledger mirror invariant (spec §8):
 *   Every event is first mirrored to the local ledger via
 *   `emitTelemetry`. The fetch only includes events whose ledger
 *   write succeeded — we never send what we cannot log. On the
 *   sendBeacon unload path the mirror is fire-and-forget; that is an
 *   acknowledged gap until 5B introduces a synchronous outbox.
 */

import { emitTelemetry } from '$lib/telemetry/egress-registry';

export type EventName =
  | 'install_nudge_eligible'
  | 'install_nudge_shown'
  | 'install_nudge_dismissed'
  | 'install_nudge_accepted'
  | 'pwa_standalone_launch'
  | 'sw_update_shown'
  | 'sw_update_skipped'
  | 'sw_update_refreshed'
  | 'viewport_mode'
  | 'keyboard_open_in_tool'
  | 'ledger_retention_swept';

interface ShellEvent {
  event_name: EventName;
  properties?: Record<string, string | number | boolean>;
  ts: number;
}

const ENDPOINT = '/__shippie/analytics?slug=__shippie_shell__';
const BATCH_DEBOUNCE_MS = 2000;
const QUEUE_CAP = 200;
const SHELL_APP = '__shippie_shell__';

const queue: ShellEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let beaconBound = false;

export function track(event_name: EventName, properties?: ShellEvent['properties']): void {
  queue.push({ event_name, properties, ts: Date.now() });
  bindBeaconOnce();
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  if (typeof window === 'undefined') return;
  flushTimer = setTimeout(flush, BATCH_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0);

  // Mirror invariant: ledger write happens before egress. Events whose
  // mirror fails are dropped on the floor so we never send what we
  // could not also log on-device.
  const mirrored: ShellEvent[] = [];
  for (const event of batch) {
    const payload_bytes = jsonBytes(event);
    const result = await emitTelemetry({
      channel: 'shell-analytics',
      event_name: event.event_name,
      app: SHELL_APP,
      payload_bytes,
    });
    if (result.mirrored || result.reason === 'idb-unavailable') {
      // idb-unavailable is the SSR / test path where there is no
      // device ledger to mirror to. Treat as best-effort.
      mirrored.push(event);
    }
  }
  if (mirrored.length === 0) return;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: mirrored }),
      keepalive: true,
    });
    if (!res.ok) {
      // 404 unknown_app / 429 rate_limited / 500 insert_failed all reach
      // here without throwing. Re-queue (capped) so events aren't silently
      // lost — e.g. if the shell-app seed migration hasn't applied yet.
      requeue(mirrored, `non-2xx ${res.status}`);
    }
  } catch (err) {
    requeue(mirrored, `network ${String(err)}`);
  }
}

function requeue(batch: ShellEvent[], reason: string): void {
  if (queue.length + batch.length > QUEUE_CAP) {
    // Drop the oldest to bound the queue. Better to lose old telemetry
    // than to grow unbounded against a permanently-broken endpoint.
    const drop = queue.length + batch.length - QUEUE_CAP;
    batch.splice(0, drop);
  }
  queue.unshift(...batch);
  if (typeof console !== 'undefined') {
    console.warn(`[shell-track] requeued ${batch.length} events (${reason})`);
  }
}

function bindBeaconOnce(): void {
  if (beaconBound) return;
  if (typeof window === 'undefined') return;
  beaconBound = true;
  // sendBeacon on visibility-change covers the cases fetch can't:
  // PWA close, tab close, navigation. The body must be a Blob with the
  // correct content-type so the server-side JSON parser accepts it.
  //
  // Mirror invariant gap: we cannot await emitTelemetry on the unload
  // path. Fire-and-forget the mirror writes, then send the beacon.
  // 5B introduces a synchronous outbox that closes this gap.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || queue.length === 0) return;
    const batch = queue.splice(0);
    for (const event of batch) {
      void emitTelemetry({
        channel: 'shell-analytics',
        event_name: event.event_name,
        app: SHELL_APP,
        payload_bytes: jsonBytes(event),
      });
    }
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
      const ok = navigator.sendBeacon?.(ENDPOINT, blob) ?? false;
      if (!ok) requeue(batch, 'beacon-rejected');
    } catch (err) {
      requeue(batch, `beacon ${String(err)}`);
    }
  });
}

function jsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  } catch {
    return 0;
  }
}
