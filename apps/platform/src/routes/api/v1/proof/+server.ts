/**
 * Runtime proof ingestion — `POST /api/v1/proof`.
 *
 * Called by the wrapper from any maker app at `<slug>.shippie.app` to
 * record a tiny, strictly-typed runtime event (e.g. `offline_loaded`,
 * `local_db_used`, `ai_ran_local`, `peer_synced`). The daily
 * `capability-badges` cron rolls these up into Capability Proof Badges.
 *
 * Request shape:
 *   {
 *     appSlug: 'recipe-saver',
 *     deviceHash: 'sha256-opaque-string',
 *     deployId?: 'optional-deploy-id',
 *     events: [
 *       { eventType: 'offline_loaded', payload?: { ... } },
 *       { eventType: 'local_db_used' }
 *     ]
 *   }
 *
 * Server-side guarantees:
 *   - Unknown `eventType` values are rejected (not silently dropped) —
 *     the taxonomy is the security boundary.
 *   - The `deviceHash` is opaque and never joined to any user. Used
 *     only for the distinct-devices threshold in the badge rollup.
 *   - Per-app rate limit (KV-backed): 60 events / minute / device hash.
 *     Bursts above that return 429; legitimate wrappers shouldn't hit
 *     it because they only emit on real runtime moments.
 *
 * Response: 202 Accepted with `{ accepted: <number> }`. We never echo
 * back the raw events.
 */
import { json, error as kitError } from '@sveltejs/kit';
import { getDrizzleClient, schema } from '$server/db/client';
import { eq } from 'drizzle-orm';
import { isProofEventType, PROOF_EVENT_TYPES } from '$server/proof/taxonomy';
import type { RequestHandler } from './$types';

const MAX_EVENTS_PER_REQUEST = 16;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 60;

interface ProofIngestBody {
  appSlug: unknown;
  deviceHash: unknown;
  deployId?: unknown;
  events: unknown;
}

interface IncomingEvent {
  eventType: string;
  payload?: Record<string, unknown>;
}

interface ParsedBody {
  appSlug: string;
  deviceHash: string;
  deployId: string | null;
  events: IncomingEvent[];
}

function parseBody(body: ProofIngestBody): { ok: true; value: ParsedBody } | { ok: false; reason: string } {
  if (typeof body.appSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(body.appSlug)) {
    return { ok: false, reason: 'appSlug invalid' };
  }
  if (typeof body.deviceHash !== 'string' || body.deviceHash.length < 16 || body.deviceHash.length > 256) {
    return { ok: false, reason: 'deviceHash invalid' };
  }
  if (body.deployId !== undefined && body.deployId !== null && typeof body.deployId !== 'string') {
    return { ok: false, reason: 'deployId invalid' };
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return { ok: false, reason: 'events must be a non-empty array' };
  }
  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    return { ok: false, reason: `events array exceeds limit of ${MAX_EVENTS_PER_REQUEST}` };
  }
  const events: IncomingEvent[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'event entry not an object' };
    }
    const ev = raw as { eventType?: unknown; payload?: unknown };
    if (!isProofEventType(ev.eventType)) {
      return { ok: false, reason: `eventType not in taxonomy (allowed: ${PROOF_EVENT_TYPES.join(', ')})` };
    }
    let payload: Record<string, unknown> | undefined;
    if (ev.payload !== undefined && ev.payload !== null) {
      if (typeof ev.payload !== 'object' || Array.isArray(ev.payload)) {
        return { ok: false, reason: 'payload must be an object' };
      }
      payload = ev.payload as Record<string, unknown>;
    }
    events.push({ eventType: ev.eventType, payload });
  }
  return {
    ok: true,
    value: {
      appSlug: body.appSlug,
      deviceHash: body.deviceHash,
      deployId: typeof body.deployId === 'string' ? body.deployId : null,
      events,
    },
  };
}

interface IngestEnv {
  DB: import('@cloudflare/workers-types').D1Database;
  CACHE?: import('@cloudflare/workers-types').KVNamespace;
}

/**
 * Returns true if the request should be allowed; false if it's been
 * rate-limited. Uses CACHE (KV) when available; otherwise no-ops (dev).
 */
async function checkRateLimit(env: IngestEnv, appSlug: string, deviceHash: string): Promise<boolean> {
  if (!env.CACHE) return true;
  const key = `proof:rl:${appSlug}:${deviceHash}`;
  const current = await env.CACHE.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  if (Number.isNaN(count) || count >= RATE_LIMIT_MAX) {
    return count < RATE_LIMIT_MAX;
  }
  await env.CACHE.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  return true;
}

export const POST: RequestHandler = async ({ request, platform }) => {
  let body: ProofIngestBody;
  try {
    body = (await request.json()) as ProofIngestBody;
  } catch {
    throw kitError(400, 'Invalid JSON body.');
  }
  const parsed = parseBody(body);
  if (!parsed.ok) {
    throw kitError(400, parsed.reason);
  }

  const env = (platform?.env ?? {}) as IngestEnv;
  if (!env.DB) {
    throw kitError(503, 'Database binding missing.');
  }

  const allowed = await checkRateLimit(env, parsed.value.appSlug, parsed.value.deviceHash);
  if (!allowed) {
    throw kitError(429, 'Rate limit exceeded.');
  }

  const db = getDrizzleClient(env.DB);

  // Resolve appSlug → appId. We store events keyed by appId so renames
  // don't orphan the proof history.
  const app = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, parsed.value.appSlug))
    .limit(1);
  if (app.length === 0) {
    throw kitError(404, 'App not found.');
  }
  const appId = app[0]!.id;

  const rows = parsed.value.events.map((ev) => ({
    appId,
    deployId: parsed.value.deployId,
    deviceHash: parsed.value.deviceHash,
    eventType: ev.eventType,
    payload: ev.payload ?? null,
  }));
  await db.insert(schema.proofEvents).values(rows);

  return json({ accepted: rows.length }, { status: 202 });
};
