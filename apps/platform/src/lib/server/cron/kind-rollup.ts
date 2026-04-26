/**
 * Kind-status rollup — promotes `apps.currentPublicKindStatus` from
 * `estimated` → `verifying` → `confirmed` once kind-confirming proof
 * events accumulate from enough distinct devices, or demotes a Local /
 * Connected app when a personal-data leak is observed.
 *
 * Rules live in `proof/taxonomy.ts → KIND_CONFIRMATION_RULES`. Wired
 * into the daily 4am cron alongside `capability-badges` and `retention`.
 *
 * Idempotent: re-running for the same day re-derives the same status.
 */
import { eq, gte, sql } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import {
  KIND_CONFIRMATION_RULES,
  type ProofEventType,
} from '../proof/taxonomy';
import type {
  AppKind,
  PublicKindStatus,
} from '$lib/types/app-kind';
import type { D1Database } from '@cloudflare/workers-types';

export interface KindRollupEnv {
  DB: D1Database;
}

export interface KindRollupResult {
  appsScanned: number;
  promoted: number;
  demoted: number;
  unchanged: number;
}

interface PerEventCounts {
  [eventType: string]: number;
}

/**
 * Pure helper — given a detected kind, prior public status, and the
 * device-hash counts per kind event (filtered to the rule's window),
 * return the new public kind + status.
 *
 * Rules:
 *  - `kind_leak_personal_data` ≥ 1 device on a Local detection demotes
 *    to Connected. On Connected, demotes to Cloud. Cloud doesn't react
 *    to leaks (it already names the host).
 *  - For Local / Connected: if every event in the rule meets threshold,
 *    status = `confirmed`. If any event is observed but threshold not
 *    met, status = `verifying`. Otherwise `estimated`.
 *  - `disputed` is sticky — only manual reset clears it.
 */
export function deriveKindStatus(
  detectedKind: AppKind,
  priorStatus: PublicKindStatus | null,
  counts: PerEventCounts,
): { kind: AppKind; status: PublicKindStatus } {
  if (priorStatus === 'disputed') {
    return { kind: detectedKind, status: 'disputed' };
  }

  const leakCount = counts.kind_leak_personal_data ?? 0;
  if (leakCount > 0) {
    if (detectedKind === 'local') {
      return { kind: 'connected', status: 'verifying' };
    }
    if (detectedKind === 'connected') {
      return { kind: 'cloud', status: 'verifying' };
    }
    return { kind: 'cloud', status: priorStatus ?? 'estimated' };
  }

  if (detectedKind === 'cloud') {
    return { kind: 'cloud', status: priorStatus ?? 'estimated' };
  }

  const rule = KIND_CONFIRMATION_RULES[detectedKind];
  let allMet = true;
  let anyObserved = false;
  for (const eventType of rule.events) {
    const count = counts[eventType] ?? 0;
    if (count > 0) anyObserved = true;
    if (count < rule.threshold) allMet = false;
  }
  if (allMet) return { kind: detectedKind, status: 'confirmed' };
  if (anyObserved) return { kind: detectedKind, status: 'verifying' };
  return { kind: detectedKind, status: 'estimated' };
}

function windowCutoffIso(windowDays: number): string {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

const KIND_EVENT_TYPES: ProofEventType[] = [
  'kind_local_launch_offline',
  'kind_local_write_local',
  'kind_local_workflow_offline',
  'kind_connected_graceful_degrade',
  'kind_leak_personal_data',
];

export async function kindRollup(env: KindRollupEnv): Promise<KindRollupResult> {
  const db = getDrizzleClient(env.DB);

  // Longest window across both rules.
  const windowDays = Math.max(
    KIND_CONFIRMATION_RULES.local.windowDays,
    KIND_CONFIRMATION_RULES.connected.windowDays,
  );
  const cutoff = windowCutoffIso(windowDays);

  // Pull only the kind-namespace events to keep this rollup orthogonal
  // to the capability-badges rollup.
  const rows = await db
    .select({
      appId: schema.proofEvents.appId,
      eventType: schema.proofEvents.eventType,
      deviceHash: schema.proofEvents.deviceHash,
    })
    .from(schema.proofEvents)
    .where(
      sql`${schema.proofEvents.ts} >= ${cutoff} AND ${schema.proofEvents.eventType} IN (${sql.join(
        KIND_EVENT_TYPES.map((t) => sql`${t}`),
        sql`, `,
      )})`,
    );

  // appId → eventType → Set<deviceHash>
  const byApp = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    let appBucket = byApp.get(row.appId);
    if (!appBucket) {
      appBucket = new Map();
      byApp.set(row.appId, appBucket);
    }
    let typeBucket = appBucket.get(row.eventType);
    if (!typeBucket) {
      typeBucket = new Set();
      appBucket.set(row.eventType, typeBucket);
    }
    typeBucket.add(row.deviceHash);
  }

  // Pull current denormalized state for every app that received events
  // (plus apps with a non-null detectedKind that didn't — they may need
  // to settle to `estimated` if they previously had `verifying`).
  const allApps = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      currentDetectedKind: schema.apps.currentDetectedKind,
      currentPublicKindStatus: schema.apps.currentPublicKindStatus,
    })
    .from(schema.apps);

  let promoted = 0;
  let demoted = 0;
  let unchanged = 0;

  for (const app of allApps) {
    if (!app.currentDetectedKind) continue;
    const detectedKind = app.currentDetectedKind as AppKind;
    const priorStatus = app.currentPublicKindStatus as PublicKindStatus | null;
    const eventBuckets = byApp.get(app.id);

    const counts: PerEventCounts = {};
    if (eventBuckets) {
      for (const [eventType, devices] of eventBuckets) {
        counts[eventType] = devices.size;
      }
    }

    const result = deriveKindStatus(detectedKind, priorStatus, counts);

    if (
      result.kind === detectedKind &&
      result.status === priorStatus
    ) {
      unchanged += 1;
      continue;
    }

    await db
      .update(schema.apps)
      .set({
        currentDetectedKind: result.kind,
        currentPublicKindStatus: result.status,
      })
      .where(eq(schema.apps.id, app.id));

    if (rankKind(result.kind) > rankKind(detectedKind)) {
      demoted += 1;
    } else if (statusRank(result.status) > statusRank(priorStatus)) {
      promoted += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log(
    `[cron:kind-rollup] apps=${allApps.length} promoted=${promoted} demoted=${demoted} unchanged=${unchanged}`,
  );

  return {
    appsScanned: allApps.length,
    promoted,
    demoted,
    unchanged,
  };
}

function rankKind(kind: AppKind): number {
  if (kind === 'local') return 0;
  if (kind === 'connected') return 1;
  return 2;
}

function statusRank(status: PublicKindStatus | null): number {
  if (!status || status === 'estimated') return 0;
  if (status === 'verifying') return 1;
  if (status === 'confirmed') return 2;
  return -1; // disputed — neutral
}
