/**
 * Remix data-passport compatibility — wires the existing contract assessor
 * (assessDataPassportCompatibility) into the remix flow so a maker can see
 * whether a remix will be able to read the parent app's saved data.
 *
 * The Data Passport machinery already existed in @shippie/app-package-contract;
 * what was missing was surfacing it at remix time. This module is that bridge.
 */
import {
  assessDataPassportCompatibility,
  type AppDataPassportRecord,
  type DataPassportCompatibilityStatus,
} from '@shippie/app-package-contract';

export interface RemixDataCompatibility {
  parentFamily: string | null;
  status: DataPassportCompatibilityStatus;
  summary: string;
}

function passport(family: string, schema?: string | null): AppDataPassportRecord {
  return { schemaVersion: 1, family, schema: schema ?? `${family}.v1` };
}

/**
 * Describe whether a remix can read the parent app's data.
 *
 * - Parent family unknown → 'unknown'; the remix should start fresh.
 * - Child family not yet known (handoff time, before the child is built) →
 *   'unknown' but with the inherited parent family so the maker can decide.
 * - Both known (e.g. on remix deploy) → delegates to the contract assessor for
 *   the authoritative same-schema / same-family / migration-required /
 *   incompatible-family verdict.
 */
export function describeRemixDataCompatibility(
  parent: { family: string | null | undefined; schema?: string | null },
  child?: { family?: string | null; schema?: string | null },
): RemixDataCompatibility {
  if (!parent.family) {
    return {
      parentFamily: null,
      status: 'unknown',
      summary: 'The parent app has no declared data family; treat the remix as starting fresh.',
    };
  }
  if (!child?.family) {
    return {
      parentFamily: parent.family,
      status: 'unknown',
      summary: `This remix inherits the "${parent.family}" data family. Keep the same family and schema to read the parent's existing data; change it to start with a clean slate.`,
    };
  }
  const result = assessDataPassportCompatibility(
    passport(parent.family, parent.schema),
    passport(child.family, child.schema),
  );
  return { parentFamily: parent.family, status: result.status, summary: result.summary };
}
