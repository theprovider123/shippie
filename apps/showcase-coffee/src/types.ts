// lot. domain types. All user data is local-first (localStorage); the only
// thing that ever leaves the device is an explicitly-published cup score,
// broadcast through the Shippie intent bus.

export type RoastLevel = 'light' | 'medium' | 'dark';

export type BrewMethod =
  | 'v60'
  | 'aeropress'
  | 'chemex'
  | 'espresso'
  | 'moka'
  | 'frenchpress'
  | 'coldbrew';

export type BagStatus = 'active' | 'wishlist' | 'finished';

/** A physical bag of coffee the user owns, wants, or has finished. */
export interface Bag {
  id: string;
  name: string;
  roasterName: string;
  roasterSlug?: string;
  originCountry?: string;
  originRegion?: string;
  originFarm?: string;
  variety?: string;
  process?: string;
  roastLevel: RoastLevel;
  /** ISO date (YYYY-MM-DD). Load-bearing for the freshness window. */
  roastDate?: string;
  openedDate?: string;
  purchaseDate?: string;
  gramsRemaining: number;
  gramsOriginal: number;
  status: BagStatus;
  barcode?: string;
  sourceUrl?: string;
  notes?: string;
  /** Links the bag to a World graph node (origin/variety/process slug). */
  worldNodeSlug?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeStep {
  label: string;
  targetTime: number; // seconds (cumulative)
  targetVolume: number; // grams of water poured by this step
  notes?: string;
}

/** Brew instructions attached to a bag + method. */
export interface Recipe {
  id: string;
  bagId: string;
  method: BrewMethod;
  dose: number;
  yield: number;
  ratio: string; // e.g. "1:2" or "1:16"
  grindSetting: string;
  grinderId?: string;
  waterTemp: number;
  totalTime: number; // seconds
  steps: RecipeStep[];
  isActive: boolean;
  isDialled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StepTiming {
  label: string;
  targetTime: number;
  actualTime: number;
}

/** One brew session. */
export interface BrewLog {
  id: string;
  bagId: string;
  recipeId?: string;
  actualDose?: number;
  actualYield?: number;
  actualTime: number; // seconds
  stepTimings: StepTiming[];
  notes?: string;
  published: boolean;
  createdAt: string;
}

export type CupAxis = 'brightness' | 'body' | 'sweetness' | 'complexity' | 'clean';

/** The five-axis cup rating. Each axis is 1–10. */
export interface CupScore {
  id: string;
  bagId: string;
  brewLogId?: string;
  brightness: number;
  body: number;
  sweetness: number;
  complexity: number;
  clean: number;
  tasteNotes: string[];
  published: boolean;
  publishedAt?: string;
  createdAt: string;
}

export interface Grinder {
  id: string;
  name: string;
  type: 'burr' | 'blade';
  notes?: string;
  createdAt: string;
}

/** A pending publish to the shared graph (drained by lib/sync). */
export interface SyncItem {
  id: string;
  type: 'cupScore' | 'cupNote' | 'roasterEdit' | 'originEdit';
  payload: unknown;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
  sentAt?: string;
}

export const CUP_AXES: readonly CupAxis[] = [
  'brightness',
  'body',
  'sweetness',
  'complexity',
  'clean',
];

export const CUP_AXIS_LABELS: Record<CupAxis, string> = {
  brightness: 'Brightness',
  body: 'Body',
  sweetness: 'Sweetness',
  complexity: 'Complexity',
  clean: 'Clean',
};
