/** Small display helpers shared by the UI. */

export const fmt = (n: number): string => Math.round(n).toString();

export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function timeOf(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function pct(n: number): string {
  return `${Math.round(clamp01(n) * 100)}%`;
}
