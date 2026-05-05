export const DEFAULT_PLAYERS = ['Saka', 'Odegaard', 'Rice', 'Saliba'];

export function durationFromMinutes(minutes: number): number {
  return Math.max(15, Math.round(minutes * 60));
}
