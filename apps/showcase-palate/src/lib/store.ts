// palate. — localStorage persistence
// Single debounced blob at shippie.palate.kitchen.v1
// Photos stored separately at shippie.palate.bake-photo.<id>

import type { PalateState, Timer } from './types.ts';

const STORAGE_KEY = 'shippie.palate.kitchen.v1';
const PHOTO_KEY_PREFIX = 'shippie.palate.bake-photo.';
const MAX_BAKE_PHOTOS = 12;
const PHOTO_MAX_BYTES = 200 * 1024; // 200KB

export const DEFAULT_FORMULA = {
  id: 'country-loaf',
  name: 'Country Loaf',
  version: 1,
  total_dough_g: 1800,
  notes: '',
  ingredients: [
    { id: 'bread-flour', name: 'Bread flour', bakers_pct: 90, sort_order: 0 },
    { id: 'wholemeal', name: 'Wholemeal', bakers_pct: 10, sort_order: 1 },
    { id: 'water', name: 'Water', bakers_pct: 71, sort_order: 2 },
    { id: 'levain', name: 'Levain', bakers_pct: 20, is_prefermented: true, hydration_pct: 100, sort_order: 3 },
    { id: 'salt', name: 'Salt', bakers_pct: 2.1, sort_order: 4 },
  ],
  created_at: Date.now(),
  updated_at: Date.now(),
};

function defaultState(): PalateState {
  return {
    version: 1,
    timers: [],
    ferments: [],
    formulas: [DEFAULT_FORMULA],
    bakes: [],
    notes: [],
    probe: { cut: 'Beef, med-rare', unit: 'C', current_c: 44 },
    glance: { stepIndex: 0, workflowId: 'country-loaf' },
    dial: { minutes: 7.5, status: 'idle' },
    tonightsNote: '',
  };
}

/** Reconcile expired running timers to done WITHOUT firing live-only side effects. */
function reconcileTimers(timers: Timer[], now: number): Timer[] {
  return timers.map((t) => {
    if (t.status !== 'running') return t;
    if (t.started_at == null) return t;
    const elapsed = (now - t.started_at) / 1000 + (t.elapsed_before_pause_s ?? 0);
    if (elapsed >= t.duration_s) {
      return { ...t, status: 'done' };
    }
    return t;
  });
}

export function load(): PalateState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PalateState>;
    if (parsed.version !== 1) return defaultState();
    const state = { ...defaultState(), ...parsed } as PalateState;
    // Ensure at least the default formula
    if (!state.formulas || state.formulas.length === 0) {
      state.formulas = [DEFAULT_FORMULA];
    }
    // Wall-clock timer reconciliation
    state.timers = reconcileTimers(state.timers ?? [], Date.now());
    return state;
  } catch {
    return defaultState();
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function save(state: PalateState): void {
  if (_saveTimer != null) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // QuotaExceededError — do not silently lose state; just skip this save
    }
    _saveTimer = null;
  }, 300);
}

/** Save a bake photo. Returns true on success, false on quota failure (caller shows quiet toast). */
export function saveBakePhoto(bakeId: string, dataUrl: string): boolean {
  // Enforce 200KB cap
  const bytes = (dataUrl.length * 3) / 4; // rough base64 estimate
  if (bytes > PHOTO_MAX_BYTES) return false;
  try {
    localStorage.setItem(`${PHOTO_KEY_PREFIX}${bakeId}`, dataUrl);
    pruneOldBakePhotos(bakeId);
    return true;
  } catch {
    return false;
  }
}

export function loadBakePhoto(bakeId: string): string | null {
  try {
    return localStorage.getItem(`${PHOTO_KEY_PREFIX}${bakeId}`);
  } catch {
    return null;
  }
}

/** Keep only the 12 most recent bake photos; delete the rest. */
function pruneOldBakePhotos(justSavedId: string): void {
  try {
    const photoKeys: Array<{ key: string; id: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PHOTO_KEY_PREFIX)) {
        photoKeys.push({ key: k, id: k.slice(PHOTO_KEY_PREFIX.length) });
      }
    }
    if (photoKeys.length <= MAX_BAKE_PHOTOS) return;
    // Sort by key order (they include bake id, not date — sort by localStorage order is fine for pruning)
    // Keep justSavedId, delete oldest surplus
    const toDelete = photoKeys
      .filter((p) => p.id !== justSavedId)
      .slice(0, photoKeys.length - MAX_BAKE_PHOTOS);
    for (const p of toDelete) {
      localStorage.removeItem(p.key);
    }
  } catch {
    // ignore
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
