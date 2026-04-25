import { and, eq, gte, inArray } from 'drizzle-orm';
import { schema } from '@shippie/db';
import type { ShippieDbHandle } from '@shippie/db';

export type CapabilityProofName =
  | 'local.opfs_probe'
  | 'local.persist_granted'
  | 'local.db_used'
  | 'local.files_used'
  | 'local.ai_model_cached';

const PROOF_NAMES: CapabilityProofName[] = [
  'local.opfs_probe',
  'local.persist_granted',
  'local.db_used',
  'local.files_used',
  'local.ai_model_cached',
];

const PROOF_WINDOW_DAYS = 30;

export interface ProvenCapabilities {
  opfs: boolean;
  persist: boolean;
  db: boolean;
  files: boolean;
  ai: boolean;
}

export async function readProvenCapabilities(
  db: ShippieDbHandle['db'],
  appId: string,
  windowDays: number = PROOF_WINDOW_DAYS,
): Promise<ProvenCapabilities> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ eventType: schema.appEvents.eventType })
    .from(schema.appEvents)
    .where(
      and(
        eq(schema.appEvents.appId, appId),
        inArray(schema.appEvents.eventType, PROOF_NAMES),
        gte(schema.appEvents.ts, since),
      ),
    )
    .limit(1000);
  const seen = new Set(rows.map((r) => r.eventType as CapabilityProofName));
  return capabilitiesFromSeen(seen);
}

export async function readProvenCapabilitiesBatch(
  db: ShippieDbHandle['db'],
  appIds: string[],
  windowDays: number = PROOF_WINDOW_DAYS,
): Promise<Map<string, ProvenCapabilities>> {
  const result = new Map<string, ProvenCapabilities>();
  if (appIds.length === 0) return result;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ appId: schema.appEvents.appId, eventType: schema.appEvents.eventType })
    .from(schema.appEvents)
    .where(
      and(
        inArray(schema.appEvents.appId, appIds),
        inArray(schema.appEvents.eventType, PROOF_NAMES),
        gte(schema.appEvents.ts, since),
      ),
    );
  const grouped = new Map<string, Set<CapabilityProofName>>();
  for (const row of rows) {
    const set = grouped.get(row.appId) ?? new Set<CapabilityProofName>();
    set.add(row.eventType as CapabilityProofName);
    grouped.set(row.appId, set);
  }
  for (const id of appIds) result.set(id, capabilitiesFromSeen(grouped.get(id) ?? new Set()));
  return result;
}

function capabilitiesFromSeen(seen: Set<CapabilityProofName>): ProvenCapabilities {
  return {
    opfs: seen.has('local.opfs_probe'),
    persist: seen.has('local.persist_granted'),
    db: seen.has('local.db_used'),
    files: seen.has('local.files_used'),
    ai: seen.has('local.ai_model_cached'),
  };
}

export const PROOF_NAMES_LIST = PROOF_NAMES;
