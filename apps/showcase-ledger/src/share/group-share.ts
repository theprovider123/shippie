/**
 * Group share + import. Signed `#shippie-import=…` fragment carrying
 * a group's skeleton (name, base currency, members) and — optionally
 * — its current expenses.
 *
 * Privacy: the share carries member display names + amounts; nothing
 * device-identifying beyond the public signing key (already used by
 * @shippie/share for every shared blob).
 *
 * The importer chooses to accept; nothing is added silently.
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  type ShareBlob,
} from '@shippie/share';
import type { Group, GroupExpense, GroupMember } from '../db/groups-schema.ts';

export const GROUP_SHARE_TYPE = 'ledger-group';

export interface GroupSharePayload {
  name: string;
  base_currency: string;
  members: GroupMember[];
  expenses: Array<{
    paid_by_id: string;
    amount_cents: number;
    currency: string;
    note: string | null;
    occurred_on: string;
    split_among: string[];
  }>;
}

export type GroupImportCheck =
  | {
      ok: true;
      payload: GroupSharePayload;
      verified: boolean;
      blob: ShareBlob<GroupSharePayload>;
    }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' | 'malformed' };

export async function buildGroupShare(
  group: Group,
  expenses: ReadonlyArray<GroupExpense>,
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin + '/'
    : '/',
): Promise<{ blob: ShareBlob<GroupSharePayload>; url: string }> {
  const payload: GroupSharePayload = {
    name: group.name,
    base_currency: group.base_currency,
    members: group.members.map(({ is_me: _omit, ...m }) => m),
    expenses: expenses.map((e) => ({
      paid_by_id: e.paid_by_id,
      amount_cents: e.amount_cents,
      currency: e.currency,
      note: e.note,
      occurred_on: e.occurred_on,
      split_among: e.split_among,
    })),
  };
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<GroupSharePayload>({
    type: GROUP_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob, url };
}

export function checkGroupImport(blob: ShareBlob): GroupImportCheck {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== GROUP_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const payload = blob.payload as GroupSharePayload | undefined;
  if (
    !payload ||
    typeof payload.name !== 'string' ||
    typeof payload.base_currency !== 'string' ||
    !Array.isArray(payload.members) ||
    !Array.isArray(payload.expenses)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  return {
    ok: true,
    payload,
    verified: true,
    blob: blob as ShareBlob<GroupSharePayload>,
  };
}
