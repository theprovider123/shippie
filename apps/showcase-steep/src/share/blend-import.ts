/**
 * Receiver-side import for shared blends.
 *
 * Verifies the signature, then writes the blend + ingredients to the
 * local DB. Herb references resolve by slug against the local library;
 * if a slug is unknown we add a stub herb with `source: 'user'` so the
 * blend still works.
 */
import type { ShareBlob, VerifyResult } from '@shippie/share';
import { verifyBlob } from '@shippie/share';
import {
  addBlendIngredient,
  createBlend,
  getHerbBySlug,
  upsertHerb,
} from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { BLEND_SHARE_TYPE, type BlendSharePayload } from './blend-share.ts';

export type BlendImportCheck =
  | {
      ok: true;
      payload: BlendSharePayload;
      verified: true;
      blob: ShareBlob<BlendSharePayload>;
    }
  | {
      ok: true;
      payload: BlendSharePayload;
      verified: false;
      reason: 'tampered' | 'malformed' | 'verifier_unavailable';
      blob: ShareBlob<BlendSharePayload>;
    }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' };

export async function checkBlendImport(blob: ShareBlob): Promise<BlendImportCheck> {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== BLEND_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const result: VerifyResult = await verifyBlob(blob);
  const typed = blob as ShareBlob<BlendSharePayload>;
  if (result.valid) {
    return { ok: true, payload: typed.payload, verified: true, blob: typed };
  }
  return {
    ok: true,
    payload: typed.payload,
    verified: false,
    reason: result.reason,
    blob: typed,
  };
}

export async function importBlend(
  payload: BlendSharePayload,
  blob: ShareBlob<BlendSharePayload>,
): Promise<string> {
  const db = resolveLocalDb();
  const provenance = buildProvenanceFooter(blob);
  const notes = [payload.notes?.trim(), provenance].filter(Boolean).join('\n\n');

  const blend = await createBlend(db, {
    name: payload.name,
    notes: notes || null,
    intent_tags: payload.intent_tags,
    default_temp_c: payload.default_temp_c,
    default_steep_minutes: payload.default_steep_minutes,
    max_resteeps: payload.max_resteeps,
    default_batch: payload.default_batch,
  });

  for (const ing of payload.ingredients) {
    let herb = await getHerbBySlug(db, ing.slug);
    if (!herb) {
      // Unknown slug — add as a user-source stub so the blend still
      // works. The user can flesh it out later from the library.
      herb = await upsertHerb(db, {
        slug: ing.slug,
        common_name: ing.common_name,
        tastes: [],
        actions: [],
        source: 'user',
      });
    }
    await addBlendIngredient(db, {
      blend_id: blend.id,
      herb_id: herb.id,
      parts: ing.parts,
      notes: ing.notes ?? null,
    });
  }

  return blend.id;
}

function buildProvenanceFooter(blob: ShareBlob<BlendSharePayload>): string {
  const author = blob.author?.name ?? 'an unnamed device';
  const when = new Date(blob.created_at).toLocaleDateString();
  const pubkeyShort = blob.author?.pubkey?.slice(0, 12) ?? '';
  return `Shared by ${author} (${pubkeyShort}…) on ${when}`;
}
