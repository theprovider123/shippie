/**
 * World Cup Fantasy — signed squad share fragment.
 *
 * Payload carries player IDs + manager name + captain + chip. The
 * receiver's Fantasy app reads the fragment, previews the squad,
 * and accepts the import (replacing their saved team on confirmation).
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  type ShareBlob,
} from '@shippie/share';
import { type Chip, type SavedTeam } from './fantasy-engine.ts';

export const SQUAD_SHARE_TYPE = 'wc-fantasy-squad';

export interface SquadSharePayload {
  manager: string;
  squadIds: string[];
  captainId: string | null;
  chip: Chip;
  updatedAt: string | null;
}

export async function buildSquadShare(
  team: SavedTeam,
  baseUrl: string = typeof window !== 'undefined'
    ? window.location.origin + '/'
    : '/',
): Promise<{ blob: ShareBlob<SquadSharePayload>; url: string }> {
  const payload: SquadSharePayload = {
    manager: team.manager,
    squadIds: team.squadIds,
    captainId: team.captainId,
    chip: team.chip,
    updatedAt: team.updatedAt,
  };
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<SquadSharePayload>({
    type: SQUAD_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob, url };
}
