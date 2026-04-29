import { describe, expect, test } from 'bun:test';
import { createRateLimiter } from './rate-limiter.ts';

describe('createRateLimiter', () => {
  test('admits actions up to maxActions inside the window', () => {
    const lim = createRateLimiter({ maxActions: 3, windowMs: 1000 });
    expect(lim.tryAcquire(0)).toBe(true);
    expect(lim.tryAcquire(100)).toBe(true);
    expect(lim.tryAcquire(200)).toBe(true);
    expect(lim.tryAcquire(300)).toBe(false);
  });

  test('readmits after the window expires', () => {
    const lim = createRateLimiter({ maxActions: 1, windowMs: 1000 });
    expect(lim.tryAcquire(0)).toBe(true);
    expect(lim.tryAcquire(500)).toBe(false);
    expect(lim.tryAcquire(1500)).toBe(true);
  });

  test('size reports current window count after pruning', () => {
    const lim = createRateLimiter({ maxActions: 3, windowMs: 1000 });
    lim.tryAcquire(0);
    lim.tryAcquire(500);
    expect(lim.size(800)).toBe(2);
    expect(lim.size(2000)).toBe(0);
  });

  test('reset empties the window', () => {
    const lim = createRateLimiter({ maxActions: 1, windowMs: 1000 });
    lim.tryAcquire(0);
    lim.reset();
    expect(lim.tryAcquire(50)).toBe(true);
  });
});
