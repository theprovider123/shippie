/**
 * shippie.track(event, props, opts)
 *
 * Fire-and-forget analytics event. Batched and flushed via a background
 * queue so callers never block on network.
 *
 * If `opts.identify: true` is set without the app having
 * `compliance.identifiable_analytics: true` in shippie.json, the
 * identify flag is silently downgraded to false with a console warning.
 * This guarantees runtime behavior matches the static compliance check
 * done by the preflight runner (Fix v5.1.2 I).
 *
 * Spec v6 §7.1, §14.
 */
import { post } from './http.ts';
import type { TrackOptions } from './types.ts';

interface EventPayload {
  event: string;
  props?: Record<string, unknown>;
  identify?: boolean;
  ts: number;
}

const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 5_000;

let buffer: EventPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let manifestCache: { identifiable_analytics: boolean } | null = null;

async function ensureManifest(): Promise<{ identifiable_analytics: boolean }> {
  if (manifestCache) return manifestCache;
  try {
    const res = await fetch('/__shippie/meta', { credentials: 'same-origin' });
    if (!res.ok) {
      manifestCache = { identifiable_analytics: false };
      return manifestCache;
    }
    const meta = (await res.json()) as {
      identifiable_analytics?: boolean;
      compliance?: { identifiable_analytics?: boolean };
    };
    manifestCache = {
      identifiable_analytics:
        meta.identifiable_analytics === true ||
        meta.compliance?.identifiable_analytics === true,
    };
    return manifestCache;
  } catch {
    manifestCache = { identifiable_analytics: false };
    return manifestCache;
  }
}

export async function track(
  event: string,
  props?: Record<string, unknown>,
  opts?: TrackOptions,
): Promise<void> {
  let identify = opts?.identify ?? false;
  if (identify) {
    const meta = await ensureManifest();
    if (!meta.identifiable_analytics) {
      if (typeof console !== 'undefined') {
        console.warn(
          '[shippie] track({ identify: true }) requires compliance.identifiable_analytics in shippie.json. Sending anonymously.',
        );
      }
      identify = false;
    }
  }

  buffer.push({ event, props, identify, ts: Date.now() });

  if (buffer.length >= MAX_BATCH) {
    await flush();
  } else {
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

export async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    await post('/analytics', { events: batch });
  } catch {
    // Swallow — analytics must never break the app. Drop the batch.
  }
}
