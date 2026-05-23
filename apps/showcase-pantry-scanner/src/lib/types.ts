/**
 * Pantry Scanner — domain types.
 *
 * Items live in localStorage under STORAGE_KEY (`shippie.pantry-scanner.v1`).
 * The schema is append-only: new optional fields are fine, renames need
 * a `v2` key + migration.
 */

export type Location = 'fridge' | 'pantry' | 'freezer' | 'spice-rack';

export const LOCATIONS: readonly Location[] = [
  'fridge',
  'pantry',
  'freezer',
  'spice-rack',
] as const;

export const LOCATION_LABELS: Record<Location, string> = {
  fridge: 'Fridge',
  pantry: 'Pantry',
  freezer: 'Freezer',
  'spice-rack': 'Spice rack',
};

export interface Item {
  id: string;
  name: string;
  /** Lowercased, punctuation-stripped name for matching. Computed on add. */
  nameKey: string;
  barcode?: string;
  quantity: number;
  unit: string;
  /** ISO date (YYYY-MM-DD). Optional. */
  expiresOn?: string;
  /** Where in the kitchen this lives. Defaults to `pantry` on legacy rows. */
  location: Location;
  /** Free-form notes — brand, source, etc. */
  notes?: string;
  /** ISO datetime — when the row was created. */
  addedAt: string;
  /** ISO datetime — when the row was last touched. */
  updatedAt: string;
}

/**
 * A single use event — recorded when the user removes the row, decrements
 * stock, or `cooked-meal` lands with this item in the ingredient list.
 * The ring-buffer is bounded (CONSUMPTION_LOG_CAP) so it never grows.
 */
export interface ConsumptionEvent {
  /** Lowercased item name key — matches Item.nameKey. */
  nameKey: string;
  /** ISO datetime when the consumption happened. */
  at: string;
  /** Where the signal came from. */
  source: 'manual' | 'cooked-meal' | 'expired-out';
  /** Quantity removed, when known. */
  quantity?: number;
}

export interface InventoryRow {
  id: string;
  name: string;
  inStock: boolean;
  quantity: number;
  unit: string;
  expiresOn?: string;
  location: Location;
}

export interface PantryLowRow {
  name: string;
  barcode?: string;
  /** ISO datetime — when the system last saw this item in stock. */
  lastSeenAt: string;
  /** Confidence of the prediction. `manual` means the user removed the row. */
  confidence: 'manual' | 'predicted';
}

/**
 * Cross-app intent shapes we consume.
 */
export interface CookedMealRow {
  cut?: string;
  method?: string;
  cookedAt?: string;
  rating?: number | null;
  /** Ingredients consumed — when the cooking app knows them. Optional. */
  ingredients?: ReadonlyArray<{ name: string; quantity?: number; unit?: string }>;
}

export interface NeedsRestockingRow {
  name: string;
}

/**
 * Pull ingredient names out of a list of cooked-meal rows. Handles unknown
 * shapes gracefully — anything not matching `CookedMealRow` is skipped.
 */
export function collectIngredientNames(rows: ReadonlyArray<unknown>): string[] {
  const out: string[] = [];
  for (const row of rows as readonly CookedMealRow[]) {
    if (!row) continue;
    if (Array.isArray(row.ingredients)) {
      for (const ing of row.ingredients) {
        if (ing && typeof ing.name === 'string') out.push(ing.name);
      }
    }
  }
  return out;
}
