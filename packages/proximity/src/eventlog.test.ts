import { describe, expect, test } from 'bun:test';
import { compareClocks, EventLog } from './eventlog.ts';

describe('EventLog', () => {
  test('append + onEntry fires for local entries', () => {
    const log = new EventLog<string>({ selfId: 'a' });
    const seen: string[] = [];
    log.onEntry((e) => seen.push(`${e.author}:${e.data}`));
    log.append('hi');
    log.append('there');
    expect(seen).toEqual(['a:hi', 'a:there']);
    expect(log.all()).toHaveLength(2);
  });

  test('apply is idempotent', () => {
    const log = new EventLog<string>({ selfId: 'a' });
    const fromB = new EventLog<string>({ selfId: 'b' }).append('hi');
    expect(log.apply(fromB)).toBe(true);
    expect(log.apply(fromB)).toBe(false);
    expect(log.all()).toHaveLength(1);
  });

  test('causal order across two peers', () => {
    const a = new EventLog<string>({ selfId: 'a' });
    const b = new EventLog<string>({ selfId: 'b' });
    const e1 = a.append('a-1');
    b.apply(e1);
    const e2 = b.append('b-1'); // sees a-1
    a.apply(e2);

    const order = a.all().map((e) => e.data);
    expect(order).toEqual(['a-1', 'b-1']);
  });

  test('LWW by key — latest entry wins', () => {
    const a = new EventLog<{ score: number }>({ selfId: 'a' });
    a.append({ score: 1 }, { key: 'p1' });
    a.append({ score: 2 }, { key: 'p1' });
    a.append({ score: 99 }, { key: 'p2' });
    const latest = a.latestByKey();
    expect(latest.get('p1')!.data.score).toBe(2);
    expect(latest.get('p2')!.data.score).toBe(99);
  });

  test('handles 100 ordered messages without conflict', () => {
    const a = new EventLog<number>({ selfId: 'a' });
    const b = new EventLog<number>({ selfId: 'b' });
    for (let i = 0; i < 50; i++) {
      const ea = a.append(i);
      b.apply(ea);
      const eb = b.append(i + 100);
      a.apply(eb);
    }
    expect(a.all()).toHaveLength(100);
    expect(b.all()).toHaveLength(100);
    // Both peers must agree on the final ordering.
    const aOrder = a.all().map((e) => `${e.author}:${e.data}`);
    const bOrder = b.all().map((e) => `${e.author}:${e.data}`);
    expect(aOrder).toEqual(bOrder);
  });

  test('snapshotClock reflects local + applied entries', () => {
    const a = new EventLog<string>({ selfId: 'a' });
    const b = new EventLog<string>({ selfId: 'b' });
    a.append('a1');
    a.append('a2');
    const eb = b.append('b1');
    a.apply(eb);
    const snap = a.snapshotClock();
    expect(snap.a).toBe(2);
    expect(snap.b).toBe(1);
  });
});

describe('compareClocks', () => {
  test('happens-before', () => {
    expect(compareClocks({ a: 1 }, { a: 2 })).toBe(-1);
    expect(compareClocks({ a: 2, b: 1 }, { a: 2, b: 3 })).toBe(-1);
  });
  test('after', () => {
    expect(compareClocks({ a: 5 }, { a: 1 })).toBe(1);
  });
  test('equal', () => {
    expect(compareClocks({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(0);
  });
  test('concurrent', () => {
    expect(compareClocks({ a: 1, b: 0 }, { a: 0, b: 1 })).toBe(0);
  });
});
