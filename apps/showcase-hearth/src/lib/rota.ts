/**
 * Rota math — pure functions over rota state.
 *
 * "Whose turn is it?" is computed, never assigned. The rota stores an
 * ordered member list + a cursor; on `markChoreDone` the cursor advances
 * by 1 (mod length). If a member has left the house, we skip them so
 * the rota stays sensible.
 */

export interface RotaShape {
  members: string[];
  cursor: number;
}

/**
 * Whose turn is it? Returns the memberId at `cursor`, skipping any
 * members that aren't in the present-members set. Returns null if the
 * rota is empty or every member has left.
 *
 * `presentIds` is the canonical list of housemates currently in the
 * room (per the members map). We don't mutate the rota when someone
 * leaves — we just skip them on read. That way if they rejoin, their
 * place in the rotation is preserved.
 */
export function whoseTurn(rota: RotaShape, presentIds: ReadonlySet<string>): string | null {
  if (rota.members.length === 0) return null;
  if (presentIds.size === 0) return null;
  for (let step = 0; step < rota.members.length; step++) {
    const idx = (rota.cursor + step) % rota.members.length;
    const candidate = rota.members[idx];
    if (candidate && presentIds.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Advance the cursor by 1 (mod length). Pure; returns the new cursor.
 * Used by markChoreDone.
 */
export function advanceCursor(rota: RotaShape): number {
  if (rota.members.length === 0) return 0;
  return (rota.cursor + 1) % rota.members.length;
}

/**
 * "Next up" — the member after the current turn-holder. Useful for
 * "and then it's X". Skips absent members like whoseTurn.
 */
export function nextUp(rota: RotaShape, presentIds: ReadonlySet<string>): string | null {
  if (rota.members.length === 0) return null;
  if (presentIds.size === 0) return null;
  for (let step = 1; step <= rota.members.length; step++) {
    const idx = (rota.cursor + step) % rota.members.length;
    const candidate = rota.members[idx];
    if (candidate && presentIds.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Cadence-aware staleness — has enough time passed since last_done_at
 * that the chore is now "due"? Pure.
 *
 * Cadences are rough — Hearth doesn't aim for due-date precision. The
 * voice doc says no friction; we just want a soft "this one's been a
 * while" surfaced on Today.
 */
export type Cadence = 'weekly' | 'fortnightly' | 'monthly';

const CADENCE_MS: Record<Cadence, number> = {
  weekly: 7 * 86_400_000,
  fortnightly: 14 * 86_400_000,
  monthly: 30 * 86_400_000,
};

export function isDue(
  cadence: Cadence,
  last_done_at: number | null,
  now: number = Date.now(),
): boolean {
  if (last_done_at == null) return true;
  return now - last_done_at >= CADENCE_MS[cadence];
}

export function daysSince(last_done_at: number | null, now: number = Date.now()): number | null {
  if (last_done_at == null) return null;
  return Math.floor((now - last_done_at) / 86_400_000);
}
