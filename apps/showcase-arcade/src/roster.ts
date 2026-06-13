export interface RosterState {
  kind: 'live' | 'cached' | 'cold';
  enabled: string[];
  blocked: string[];
}

const CACHE_KEY = 'shippie:arcade:roster:v1';

/** Render set: cold fails open on curation; blocked is always subtracted. */
export function resolveVisibleIds(bakedIds: string[], state: RosterState): string[] {
  const blocked = new Set(state.blocked);
  if (state.kind === 'cold') {
    return bakedIds.filter((id) => !blocked.has(id));
  }
  const enabled = new Set(state.enabled);
  return bakedIds.filter((id) => enabled.has(id) && !blocked.has(id));
}

function readCache(): RosterState | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { enabled?: string[]; blocked?: string[] };
    if (!Array.isArray(p.enabled) || !Array.isArray(p.blocked)) return null;
    return { kind: 'cached', enabled: p.enabled, blocked: p.blocked };
  } catch {
    return null;
  }
}

function writeCache(enabled: string[], blocked: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ enabled, blocked }));
    }
  } catch {
    /* storage may be blocked */
  }
}

/** Live fetch → cache; on failure → last-known cache; else cold. */
export async function fetchRoster(origin = ''): Promise<RosterState> {
  try {
    const res = await fetch(`${origin}/api/arcade/roster`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`roster ${res.status}`);
    const body = (await res.json()) as { enabled?: string[]; blocked?: string[] };
    const enabled = Array.isArray(body.enabled) ? body.enabled : [];
    const blocked = Array.isArray(body.blocked) ? body.blocked : [];
    writeCache(enabled, blocked);
    return { kind: 'live', enabled, blocked };
  } catch {
    return readCache() ?? { kind: 'cold', enabled: [], blocked: [] };
  }
}
