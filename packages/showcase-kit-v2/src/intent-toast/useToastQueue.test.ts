import { describe, expect, test, mock } from 'bun:test';
import { createToastQueue } from './useToastQueue';
import type { IntentMatcher } from './types';

describe('toast queue', () => {
  test('emits visible toast on push', () => {
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 1000, onVisible });
    q.push(
      { kind: 'coffee.brewed', toast: () => ({ title: 'Coffee logged' }) } satisfies IntentMatcher,
      { kind: 'coffee.brewed' },
    );
    expect(onVisible).toHaveBeenCalledTimes(1);
    const firstCall = onVisible.mock.calls[0] as unknown as [{ title: string }];
    expect(firstCall[0].title).toBe('Coffee logged');
  });

  test('throttles repeats of the same kind within the window', () => {
    let t = 1_000_000;
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 10000, onVisible, now: () => t });
    const m: IntentMatcher = {
      kind: 'k',
      toast: () => ({ title: 't' }),
      throttleMs: 30_000,
    };
    expect(q.push(m, { kind: 'k' })).toBe(true);
    t += 5_000;
    expect(q.push(m, { kind: 'k' })).toBe(false);
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  test('global cap of 3 within 30s', () => {
    let t = 1_000_000;
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 100, onVisible, now: () => t });
    const mk = (k: string): IntentMatcher => ({
      kind: k,
      toast: () => ({ title: k }),
      throttleMs: 0,
    });
    expect(q.push(mk('a'), { kind: 'a' })).toBe(true);
    t += 1;
    expect(q.push(mk('b'), { kind: 'b' })).toBe(true);
    t += 1;
    expect(q.push(mk('c'), { kind: 'c' })).toBe(true);
    t += 1;
    expect(q.push(mk('d'), { kind: 'd' })).toBe(false); // cap hit
    expect(onVisible).toHaveBeenCalledTimes(3);
  });

  test('cap recovers after window expires', () => {
    let t = 1_000_000;
    const onVisible = mock(() => {});
    const q = createToastQueue({ autoDismissMs: 100, onVisible, now: () => t });
    const mk = (k: string): IntentMatcher => ({
      kind: k,
      toast: () => ({ title: k }),
      throttleMs: 0,
    });
    q.push(mk('a'), { kind: 'a' });
    q.push(mk('b'), { kind: 'b' });
    q.push(mk('c'), { kind: 'c' });
    t += 35_000;
    expect(q.push(mk('d'), { kind: 'd' })).toBe(true);
  });
});
