/**
 * /api/cloudlet/instances/[slug]/roster — MIS / roster sync (Phase 7).
 *
 *  GET  — data-source STATUS: which sources are available for this school
 *         (Manual + CSV always; Wonde only when WONDE_API_KEY + a school id are
 *         configured) + a roster summary (active pupil/class counts).
 *  POST — PREVIEW: parse an uploaded CSV (or accept a normalised roster) and
 *         return the diff (adds/updates/deactivations) WITHOUT applying. Also
 *         surfaces CSV parse errors.
 *  PUT  — APPLY: append a `roster.imported` event carrying the diff to THIS
 *         school's workspace (append-only, replayable) + recordAudit.
 *
 * RBAC: requires `roster:manage` — held by office_manager / school_admin /
 * owner / admin. The DO stub is derived from the IMMUTABLE instance id.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { recordAudit } from '$server/admin/audit';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';
import {
  computeRosterDiff,
  fetchNormalisedRoster,
  type NormalisedRoster,
  type RosterDiff,
} from '@shippie/cloudlet-contract';
import { CsvAdapter } from '$server/cloudlet/roster-adapters';
import { wondeFromEnv } from '$server/cloudlet/wonde-adapter';

type ResolveOk = {
  error?: undefined;
  env: NonNullable<NonNullable<Parameters<RequestHandler>[0]['platform']>['env']>;
  user: NonNullable<Parameters<RequestHandler>[0]['locals']['user']>;
  db: ReturnType<typeof getDrizzleClient>;
  row: Awaited<ReturnType<typeof resolveInstanceForUser>> extends infer R
    ? R extends { row: infer Row }
      ? Row
      : never
    : never;
  stub: WorkspaceStub;
};
type ResolveResult = { error: Response } | ResolveOk;

async function resolve(
  event: Parameters<RequestHandler>[0],
  action: string,
): Promise<ResolveResult> {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return { error: json({ error: 'platform bindings unavailable' }, { status: 500 }) };
  }
  const user = event.locals.user;
  if (!user) return { error: json({ error: 'unauthenticated' }, { status: 401 }) };
  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action,
    resource: { type: 'roster' },
  });
  if (!resolved) return { error: json({ error: 'forbidden' }, { status: 403 }) };
  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${resolved.row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;
  return { env, user, db, row: resolved.row, stub };
}

/** GET — data-source status + current roster summary. */
export const GET: RequestHandler = async (event) => {
  const r = await resolve(event, 'read');
  if (r.error) return r.error;
  const snap = await r.stub.rosterSnapshot();
  // Wonde school id lives in the instance modules/branding config later; for
  // now it is read from the env-configured key + the instance slug as school id
  // placeholder. The point that matters: Wonde is gated, never crashes.
  const wonde = wondeFromEnv(r.env as { WONDE_API_KEY?: string }, r.row.slug);
  return json({
    sources: [
      { id: 'manual', label: 'Manual', available: true },
      { id: 'csv', label: 'CSV upload', available: true },
      { id: 'wonde', label: 'Wonde (MIS)', available: wonde.isConfigured() },
    ],
    summary: {
      activePupils: snap.pupils.filter((p) => p.active).length,
      activeClasses: snap.classes.filter((c) => c.active).length,
      deactivatedPupils: snap.pupils.filter((p) => !p.active).length,
    },
  });
};

/** POST — preview the diff for an uploaded CSV / normalised roster (no apply). */
export const POST: RequestHandler = async (event) => {
  const r = await resolve(event, 'manage');
  if (r.error) return r.error;

  let body: { csv?: string; roster?: NormalisedRoster; source?: string };
  try {
    body = (await event.request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  let roster: NormalisedRoster;
  let errors: Array<{ row: number; message: string }> = [];
  let source = body.source ?? 'csv';
  if (typeof body.csv === 'string') {
    const adapter = new CsvAdapter(body.csv);
    roster = await fetchNormalisedRoster(adapter);
    errors = adapter.errors;
    source = 'csv';
  } else if (body.roster) {
    roster = body.roster;
    source = body.source ?? 'manual';
  } else {
    return json({ error: 'missing_fields', required: ['csv | roster'] }, { status: 400 });
  }

  const snapshot = await r.stub.rosterSnapshot();
  const diff = computeRosterDiff(snapshot, roster);
  return json({ source, diff, errors });
};

/** PUT — apply a previewed diff: append a roster.imported event + audit. */
export const PUT: RequestHandler = async (event) => {
  const r = await resolve(event, 'manage');
  if (r.error) return r.error;

  let body: { diff?: RosterDiff; source?: string };
  try {
    body = (await event.request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.diff) return json({ error: 'missing_fields', required: ['diff'] }, { status: 400 });

  const source = body.source ?? 'csv';
  const accepted = await r.stub.appendEvent({
    clientEventId: `roster-import-${r.row.id}-${Date.now()}`,
    type: 'roster.imported',
    instanceId: r.row.id,
    actorUserId: r.user.id,
    deviceId: 'web',
    createdOfflineAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: { source, diff: body.diff },
  });

  const d = body.diff;
  await recordAudit(r.db, {
    actorUserId: r.user.id,
    action: 'roster.imported',
    targetTable: `instance:${r.row.id}`,
    targetId: source,
    after: {
      source,
      pupilAdds: d.pupils.adds.length,
      pupilUpdates: d.pupils.updates.length,
      pupilDeactivations: d.pupils.deactivations.length,
      classAdds: d.classes.adds.length,
      classDeactivations: d.classes.deactivations.length,
    },
  });

  return json({ applied: accepted.accepted, source }, { status: 201 });
};
