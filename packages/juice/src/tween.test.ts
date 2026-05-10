import { describe, expect, test } from 'bun:test';
import { easings, tween } from './tween';

describe('easings', () => {
  test('linear is identity', () => {
    expect(easings.linear(0)).toBe(0);
    expect(easings.linear(0.5)).toBe(0.5);
    expect(easings.linear(1)).toBe(1);
  });

  test('easeOut starts fast, ends slow', () => {
    const half = easings.easeOut(0.5);
    expect(half).toBeGreaterThan(0.5); // past midway by t=0.5
    expect(easings.easeOut(0)).toBe(0);
    expect(easings.easeOut(1)).toBe(1);
  });

  test('easeOutBounce ends at 1', () => {
    expect(Math.abs(easings.easeOutBounce(1) - 1)).toBeLessThan(1e-9);
  });

  test('spring lands on 1', () => {
    expect(easings.spring(1)).toBe(1);
  });
});

describe('tween (server fallback)', () => {
  test('without window, calls onUpdate(to) once + onComplete', () => {
    let value = 0;
    let completed = false;
    // No window in bun test → server-fallback path.
    const handle = tween(0, 100, 200, 'linear', (v) => { value = v; }, () => { completed = true; });
    expect(value).toBe(100);
    expect(completed).toBe(true);
    handle.cancel();
  });
});
