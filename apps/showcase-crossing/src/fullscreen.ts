/**
 * Tiny fullscreen helper. Copy-pasted across Hero showcases (Tetris,
 * Chess, Crossing, Bulwark) — the abstraction threshold isn't met
 * with four ~30-line duplicates.
 */

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.fullscreenElement);
}

export async function requestFullscreen(target: Element | null = null): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const el = target ?? document.documentElement;
  if (!el || !el.requestFullscreen) return false;
  try {
    await el.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement || !document.exitFullscreen) return;
  try { await document.exitFullscreen(); } catch {/**/}
}
