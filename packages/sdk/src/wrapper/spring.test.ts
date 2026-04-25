import { describe, expect, test } from 'bun:test';
import { animateSpring, springFrames } from './spring.ts';

describe('springFrames', () => {
  test('settles on the target and allows overshoot', () => {
    const frames = springFrames({ from: 0, to: 1, stiffness: 220, damping: 16 });
    expect(frames.at(-1)).toMatchObject({ value: 1, velocity: 0, done: true });
    expect(frames.some((frame) => frame.value > 1)).toBe(true);
  });

  test('falls back to synchronous animation without raf', () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    (globalThis as any).requestAnimationFrame = undefined;
    (globalThis as any).cancelAnimationFrame = undefined;
    const values: number[] = [];
    animateSpring((frame) => values.push(frame.value), { from: 0, to: 1, maxSteps: 2 });
    expect(values.at(-1)).toBe(1);
    (globalThis as any).requestAnimationFrame = originalRaf;
    (globalThis as any).cancelAnimationFrame = originalCancel;
  });
});
