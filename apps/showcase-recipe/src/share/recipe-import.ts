/**
 * Receiver-side import for shared recipes.
 *
 * Reads a ShareBlob (from a URL fragment, in v1) carrying a recipe
 * payload, verifies the signature, and writes the recipe + ingredients
 * to the local DB. Provenance (author + parent_hash + import date) is
 * captured as a footer in the recipe's `notes` field so it stays
 * visible without requiring a schema migration.
 */
import type { ShareBlob, VerifyResult } from '@shippie/share';
import { verifyBlob } from '@shippie/share';
import { addIngredient, createRecipe } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import {
  RECIPE_SHARE_TYPE,
  type RecipeSharePayload,
} from './recipe-share.ts';

export type RecipeImportCheck =
  | { ok: true; payload: RecipeSharePayload; verified: true; blob: ShareBlob<RecipeSharePayload> }
  | { ok: true; payload: RecipeSharePayload; verified: false; reason: 'tampered' | 'malformed' | 'verifier_unavailable'; blob: ShareBlob<RecipeSharePayload> }
  | { ok: false; reason: 'wrong_type' | 'wrong_version' };

/**
 * Validate a candidate blob is a recipe-shaped one + verify its
 * signature. Returns enough context for the import card to render
 * "from <author>", "verified / unverified / tampered", and the recipe
 * preview.
 */
export async function checkRecipeImport(blob: ShareBlob): Promise<RecipeImportCheck> {
  if (blob.v !== 1) return { ok: false, reason: 'wrong_version' };
  if (blob.type !== RECIPE_SHARE_TYPE) return { ok: false, reason: 'wrong_type' };
  const result: VerifyResult = await verifyBlob(blob);
  const typed = blob as ShareBlob<RecipeSharePayload>;
  const payload = typed.payload;
  if (result.valid) return { ok: true, payload, verified: true, blob: typed };
  return {
    ok: true,
    payload,
    verified: false,
    reason: result.reason,
    blob: typed,
  };
}

function buildProvenanceFooter(blob: ShareBlob<RecipeSharePayload>): string {
  const author = blob.author.name ?? 'an unnamed device';
  const when = new Date(blob.created_at).toLocaleDateString();
  const parent = blob.lineage?.parent_hash ? ` · parent ${blob.lineage.parent_hash}` : '';
  // Pubkey first 12 chars is enough for human recognition; the full
  // verification happens via crypto, this is just a visual breadcrumb.
  const fingerprint = blob.author.pubkey.slice(0, 12);
  return `\n\n---\nimported from ${author} (${fingerprint}…) on ${when}${parent}`;
}

/**
 * Write the imported recipe + ingredients to the local DB. Returns the
 * new recipe id so the caller can navigate to it.
 */
export async function importRecipe(
  blob: ShareBlob<RecipeSharePayload>,
  opts: { trustNotes?: boolean } = {},
): Promise<string> {
  const db = resolveLocalDb();
  const { payload } = blob;
  const baseNotes = payload.notes ?? '';
  const notes = baseNotes + buildProvenanceFooter(blob);
  const recipe = await createRecipe(db, {
    title: payload.title,
    notes,
    servings: payload.servings ?? null,
    cook_minutes: payload.cook_minutes ?? null,
  });
  for (const ing of payload.ingredients) {
    await addIngredient(db, {
      recipe_id: recipe.id,
      name: ing.name,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      barcode: ing.barcode ?? null,
      brand: ing.brand ?? null,
    });
  }
  // Note: opts.trustNotes is reserved for a future hook where a host
  // app could refuse to import the notes field if the signature is
  // invalid (anti-phishing). For v1 we always import notes since the
  // user has explicitly tapped "Import" knowing the verification state.
  void opts;
  return recipe.id;
}
