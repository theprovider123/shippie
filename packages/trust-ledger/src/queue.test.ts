import { describe, expect, it } from 'bun:test';
import { createPreInitQueue } from './queue.ts';
import type { LedgerRow } from './types.ts';

function row(id: string): LedgerRow {
  return {
    id,
    ts: 1,
    app: 'recipe',
    capability: 'db.query',
    category: 'capability',
    summary: 'db.query',
    outcome: 'ok',
  };
}

describe('createPreInitQueue', () => {
  it('accepts up to capN entries', () => {
    let t = 0;
    const q = createPreInitQueue({ capN: 3, timeoutTms: 60_000, now: () => t });
    expect(q.enqueue(row('a')).accepted).toBe(true);
    expect(q.enqueue(row('b')).accepted).toBe(true);
    expect(q.enqueue(row('c')).accepted).toBe(true);
    expect(q.enqueue(row('d'))).toEqual({ accepted: false, reason: 'queue-full' });
    expect(q.size()).toBe(3);
  });

  it('drops stale entries opportunistically on enqueue', () => {
    let t = 0;
    const q = createPreInitQueue({ capN: 3, timeoutTms: 1_000, now: () => t });
    q.enqueue(row('a'));
    t = 2_000;
    const r = q.enqueue(row('b'));
    expect(r.accepted).toBe(true);
    expect(q.size()).toBe(1);
  });

  it('drain returns entries in arrival order and empties the queue', () => {
    const q = createPreInitQueue({ capN: 5, timeoutTms: 60_000 });
    q.enqueue(row('a'));
    q.enqueue(row('b'));
    q.enqueue(row('c'));
    const drained = q.drain();
    expect(drained.map((d) => d.row.id)).toEqual(['a', 'b', 'c']);
    expect(q.size()).toBe(0);
  });

  it('expireOlderThan removes entries older than cutoff and returns count', () => {
    let t = 0;
    const q = createPreInitQueue({ capN: 5, timeoutTms: 60_000, now: () => t });
    q.enqueue(row('a'));
    t = 100;
    q.enqueue(row('b'));
    t = 200;
    q.enqueue(row('c'));
    const removed = q.expireOlderThan(150);
    expect(removed).toBe(2);
    expect(q.size()).toBe(1);
  });
});
