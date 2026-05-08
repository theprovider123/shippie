import { describe, expect, test } from 'bun:test';
import type { HandoverNote } from '../sync/care-doc.ts';
import { applyAck, canAck, rollupForViewer } from './handover.ts';

function note(partial: Partial<HandoverNote> & { id: string }): HandoverNote {
  return {
    id: partial.id,
    author: partial.author ?? 'a',
    body: partial.body ?? 'a body',
    written_at: partial.written_at ?? 1,
    acked_at: partial.acked_at ?? null,
  };
}

describe('canAck', () => {
  test('the other caregiver may ack', () => {
    const n = note({ id: 'n1', author: 'a' });
    expect(canAck(n, 'b').ok).toBe(true);
  });

  test('cannot ack your own note', () => {
    const n = note({ id: 'n1', author: 'a' });
    const r = canAck(n, 'a');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cannot-ack-own-note');
  });

  test('cannot ack an already-acked note', () => {
    const n = note({ id: 'n1', author: 'a', acked_at: 999 });
    const r = canAck(n, 'b');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already-acked');
  });
});

describe('applyAck', () => {
  test('returns a new array with acked_at set', () => {
    const notes = [note({ id: 'n1', author: 'a' })];
    const { notes: next, result } = applyAck(notes, 'n1', 'b', 1234);
    expect(result.ok).toBe(true);
    expect(next[0]?.acked_at).toBe(1234);
    // Never deletes — array length preserved (the never-delete invariant).
    expect(next.length).toBe(1);
  });

  test('unknown id is a no-op', () => {
    const notes = [note({ id: 'n1', author: 'a' })];
    const { notes: next, result } = applyAck(notes, 'nope', 'b');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown-id');
    expect(next).toBe(notes); // same reference, no new allocation
  });

  test('cannot-ack-own-note refuses without mutating', () => {
    const notes = [note({ id: 'n1', author: 'a' })];
    const { notes: next, result } = applyAck(notes, 'n1', 'a');
    expect(result.ok).toBe(false);
    expect(next).toBe(notes);
  });
});

describe('rollupForViewer — never-delete invariant included', () => {
  test('counts unread + your-turn correctly', () => {
    const notes = [
      note({ id: 'n1', author: 'a', acked_at: null }), // b's turn
      note({ id: 'n2', author: 'b', acked_at: null }), // a's turn
      note({ id: 'n3', author: 'a', acked_at: 999 }),  // acked
    ];
    const r = rollupForViewer(notes, 'b');
    expect(r.total).toBe(3);
    expect(r.unread).toBe(2);
    expect(r.yourTurnToAck).toBe(1);
  });

  test('total never decreases — entries are never deletable', () => {
    const before = [
      note({ id: 'n1', author: 'a' }),
      note({ id: 'n2', author: 'b' }),
    ];
    const { notes: after } = applyAck(before, 'n1', 'b', 5);
    expect(after.length).toBe(before.length);
    expect(rollupForViewer(after, 'b').total).toBe(rollupForViewer(before, 'b').total);
  });
});
