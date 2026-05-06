/**
 * Dough app persistence — saved bakes for the "what flour worked here"
 * post-mortem. localStorage.
 */
const STORAGE_KEY = 'shippie.dough.v1';

export interface Bake {
  id: string;
  recipe_id: string;
  recipe_name: string;
  balls: number;
  ball_g: number;
  hydration: number;
  flour_g: number;
  water_g: number;
  salt_g: number;
  leaven_g: number;
  started_at: string;
  ready_at: string;
  crumb_rating: number | null;
  notes: string;
}

interface Persisted {
  bakes: Bake[];
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bakes: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return { bakes: Array.isArray(parsed.bakes) ? parsed.bakes : [] };
  } catch {
    return { bakes: [] };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function newId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
