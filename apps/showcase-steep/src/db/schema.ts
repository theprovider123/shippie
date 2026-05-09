/**
 * Local-DB schema for Steep.
 *
 * Five tables:
 *   - herbs                — the curated library + user additions
 *   - blends               — saved tea recipes
 *   - blend_ingredients    — many-to-one to blends, ratios as parts
 *   - inventory            — what the user has on hand (grams)
 *   - brew_log             — append-only history of brews + notes
 *
 * All data lives in wa-sqlite + OPFS via @shippie/local-db. Nothing
 * leaves the device unless the user explicitly exports or backs up.
 *
 * Array-shaped fields (tastes, actions, intent_tags) are stored as
 * comma-joined strings in SQL and round-tripped through helpers below
 * because the local-db contract is column-typed, not document-typed.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const HERBS_TABLE = 'herbs';
export const BLENDS_TABLE = 'blends';
export const BLEND_INGREDIENTS_TABLE = 'blend_ingredients';
export const INVENTORY_TABLE = 'inventory';
export const BREW_LOG_TABLE = 'brew_log';

export type TasteTag = 'sweet' | 'bitter' | 'pungent' | 'sour' | 'salty' | 'astringent';
export type ActionTag =
  | 'calming'
  | 'warming'
  | 'cooling'
  | 'uplifting'
  | 'grounding'
  | 'digestive'
  | 'aromatic'
  | 'demulcent';

export type IntentTag = 'sleep' | 'calm' | 'focus' | 'digestion' | 'energy' | 'immune' | 'cycle' | 'breath';

export type BatchSize = 'cup' | 'pot' | 'tin';

export const herbsSchema: LocalDbSchema = {
  id: 'text primary key',
  slug: 'text not null',
  common_name: 'text not null',
  latin_name: 'text',
  tastes: 'text',
  actions: 'text',
  energetics: 'text',
  traditional_uses: 'text',
  default_brew_temp_c: 'integer',
  default_steep_minutes: 'integer',
  max_resteeps: 'integer',
  notes: 'text',
  source: 'text not null',
  created_at: 'datetime',
  updated_at: 'datetime',
};

export const blendsSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  notes: 'text',
  intent_tags: 'text',
  default_temp_c: 'integer',
  default_steep_minutes: 'integer',
  max_resteeps: 'integer',
  default_batch: 'text',
  created_at: 'datetime',
  updated_at: 'datetime',
};

export const blendIngredientsSchema: LocalDbSchema = {
  id: 'text primary key',
  blend_id: 'text not null',
  herb_id: 'text not null',
  parts: 'real not null',
  notes: 'text',
};

export const inventorySchema: LocalDbSchema = {
  id: 'text primary key',
  herb_id: 'text not null',
  grams_on_hand: 'real not null',
  low_threshold_g: 'real',
  last_restocked_at: 'datetime',
};

export const brewLogSchema: LocalDbSchema = {
  id: 'text primary key',
  blend_id: 'text not null',
  brewed_at: 'datetime not null',
  batch_label: 'text',
  note: 'text',
};

export interface Herb {
  id: string;
  slug: string;
  common_name: string;
  latin_name?: string | null;
  tastes: TasteTag[];
  actions: ActionTag[];
  energetics?: string | null;
  traditional_uses?: string | null;
  default_brew_temp_c?: number | null;
  default_steep_minutes?: number | null;
  max_resteeps?: number | null;
  notes?: string | null;
  source: 'seed' | 'user';
  created_at?: string;
  updated_at?: string;
}

export interface Blend {
  id: string;
  name: string;
  notes?: string | null;
  intent_tags: IntentTag[];
  default_temp_c?: number | null;
  default_steep_minutes?: number | null;
  max_resteeps?: number | null;
  default_batch?: BatchSize | null;
  created_at?: string;
  updated_at?: string;
}

export interface BlendIngredient {
  id: string;
  blend_id: string;
  herb_id: string;
  parts: number;
  notes?: string | null;
}

export interface InventoryRow {
  id: string;
  herb_id: string;
  grams_on_hand: number;
  low_threshold_g?: number | null;
  last_restocked_at?: string | null;
}

export interface BrewLogEntry {
  id: string;
  blend_id: string;
  brewed_at: string;
  batch_label?: BatchSize | string | null;
  note?: string | null;
}

export interface BlendWithIngredients extends Blend {
  ingredients: Array<BlendIngredient & { herb: Herb | null }>;
}

/**
 * Comma-joined storage for array fields. The local-db contract is
 * column-typed, so we round-trip arrays through a delimited string. The
 * delimiter is a vertical bar — never appears in our tag vocabulary,
 * unlike commas which could appear in user notes.
 */
const TAG_DELIM = '|';

export function encodeTags<T extends string>(tags: T[] | undefined | null): string {
  if (!tags || tags.length === 0) return '';
  return tags.join(TAG_DELIM);
}

export function decodeTags<T extends string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  return raw.split(TAG_DELIM).filter((s) => s.length > 0) as T[];
}
