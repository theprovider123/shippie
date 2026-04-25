/** Stable per-tab peer id. Time prefix gives sort stability. */
export function generatePeerId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}-${rand}`;
}
