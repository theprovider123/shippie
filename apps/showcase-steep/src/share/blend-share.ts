/**
 * Blend-share helpers. Mirrors recipe-share — payload is a subset of
 * BlendWithIngredients (no IDs, no internal timestamps; herb refs are
 * by common_name + slug so the receiving device can match against its
 * own library or fall back to a transient herb).
 */
import {
  buildShareUrl,
  createSignedBlob,
  hashCanonical,
  type ShareBlob,
} from '@shippie/share';
import type { BatchSize, BlendWithIngredients, IntentTag } from '../db/schema.ts';

export const BLEND_SHARE_TYPE = 'tea-blend';

export interface BlendSharePayload {
  name: string;
  notes?: string | null;
  intent_tags: IntentTag[];
  default_temp_c?: number | null;
  default_steep_minutes?: number | null;
  max_resteeps?: number | null;
  default_batch?: BatchSize | null;
  ingredients: Array<{
    common_name: string;
    slug: string;
    parts: number;
    notes?: string | null;
  }>;
}

export function blendToPayload(blend: BlendWithIngredients): BlendSharePayload {
  return {
    name: blend.name,
    notes: blend.notes ?? null,
    intent_tags: blend.intent_tags,
    default_temp_c: blend.default_temp_c ?? null,
    default_steep_minutes: blend.default_steep_minutes ?? null,
    max_resteeps: blend.max_resteeps ?? null,
    default_batch: blend.default_batch ?? null,
    ingredients: blend.ingredients
      .filter((ing) => ing.herb)
      .map((ing) => ({
        common_name: ing.herb!.common_name,
        slug: ing.herb!.slug,
        parts: ing.parts,
        notes: ing.notes ?? null,
      })),
  };
}

export async function buildBlendShare(
  blend: BlendWithIngredients,
  baseUrl: string = typeof window !== 'undefined' ? window.location.origin + '/' : '/',
): Promise<{ blob: ShareBlob<BlendSharePayload>; url: string }> {
  const payload = blendToPayload(blend);
  const parent_hash = await hashCanonical(payload);
  const blob = await createSignedBlob<BlendSharePayload>({
    type: BLEND_SHARE_TYPE,
    payload,
    parent_hash,
  });
  const url = await buildShareUrl(blob, baseUrl);
  return { blob: blob as ShareBlob<BlendSharePayload>, url };
}
