/**
 * One-shot flag for the "Saved to this phone. Try it offline now." toast.
 *
 * Triggered once when ReadinessChip first reports `ready`. Subsequent reloads
 * are silent — the celebration only matters the first time the user crosses
 * the offline threshold.
 */

const KEY = 'parade-companion:offline-celebrated:v1';

export function shouldCelebrateOffline(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOfflineCelebrated(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Celebration is advisory; if storage is unavailable we'd rather skip
    // than fire on every reload.
  }
}
