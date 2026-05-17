/**
 * handover.ts — pure semantics for handover note state.
 *
 * The Y.Doc-backed write functions live in sync/care-doc.ts. This
 * module is the place to put logic that needs to be unit-tested
 * without spinning up a Y.Doc.
 *
 * Invariants enforced here (mirroring sync/care-doc.ts):
 *   - You cannot ack your own note.
 *   - You cannot ack a note that is already acked.
 *   - The note is never deletable.
 */
import type { HandoverNote } from '../sync/care-doc.ts';
import type { CaregiverRole } from './../sync/pairing.ts';

export interface AckResult {
  ok: boolean;
  reason?: 'cannot-ack-own-note' | 'already-acked' | 'unknown-id';
}

export function canAck(note: HandoverNote, viewer: CaregiverRole): AckResult {
  if (note.author === viewer) return { ok: false, reason: 'cannot-ack-own-note' };
  if (note.acked_at) return { ok: false, reason: 'already-acked' };
  return { ok: true };
}

export interface AckedRollup {
  total: number;
  unread: number;
  yourTurnToAck: number;
}

export function rollupForViewer(notes: readonly HandoverNote[], viewer: CaregiverRole): AckedRollup {
  let unread = 0;
  let yourTurnToAck = 0;
  for (const n of notes) {
    if (!n.acked_at) {
      unread += 1;
      if (n.author !== viewer) yourTurnToAck += 1;
    }
  }
  return { total: notes.length, unread, yourTurnToAck };
}

/**
 * Apply an ack in-memory (returns a new array). Used by tests; the
 * Y.Doc-backed `ackHandoverNote` does the production write.
 */
export function applyAck(
  notes: readonly HandoverNote[],
  entryId: string,
  viewer: CaregiverRole,
  now: number = Date.now(),
): { notes: readonly HandoverNote[]; result: AckResult } {
  const idx = notes.findIndex((n) => n.id === entryId);
  if (idx < 0) return { notes, result: { ok: false, reason: 'unknown-id' } };
  const target = notes[idx];
  if (!target) return { notes, result: { ok: false, reason: 'unknown-id' } };
  const result = canAck(target, viewer);
  if (!result.ok) return { notes, result };
  const next = [...notes];
  next[idx] = { ...target, acked_at: now };
  return { notes: next, result };
}
