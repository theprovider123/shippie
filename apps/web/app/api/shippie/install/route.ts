// apps/web/app/api/shippie/install/route.ts
/**
 * Marketplace-side beacon for the PWA install funnel.
 *
 * Mirrors the Worker's `__shippie/install` route (see
 * `services/worker/src/router/install.ts`) so the same wrapper runtime
 * can post events from either origin. Phase 3 wires this into the event
 * spine; for Phase 1 we accept the payload, log it, and return 204.
 */
import { type NextRequest } from 'next/server';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const VALID_EVENTS = new Set<string>([
  'iab_detected',
  'iab_bounced',
  'prompt_shown',
  'prompt_accepted',
  'prompt_dismissed',
]);

interface BeaconBody {
  event?: unknown;
  [key: string]: unknown;
}

export const POST = withLogger('shippie.install', async (req: NextRequest) => {
  let body: BeaconBody = {};
  try {
    body = (await req.json()) as BeaconBody;
  } catch {
    // sendBeacon may post opaque blobs — accept empty and move on.
  }

  const event = typeof body.event === 'string' ? body.event : 'unknown';
  if (!VALID_EVENTS.has(event)) {
    return new Response(null, { status: 204 });
  }

  // Phase 3 replaces this stdout log with an event-spine insert.
  console.log(
    JSON.stringify({
      level: 'info',
      route: 'shippie.install',
      event,
      ua: req.headers.get('user-agent') ?? undefined,
      referer: req.headers.get('referer') ?? undefined,
      ...body,
    }),
  );

  return new Response(null, { status: 204 });
});
