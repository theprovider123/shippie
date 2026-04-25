import { describe, expect, it } from 'bun:test';
import { Window } from 'happy-dom';
import { computeWarmth, applyPageWarmth } from './page.ts';

const baseState = { firstSeenAt: 0, lastSeenAt: 0, sessionCount: 0, milestonesFired: [] };

describe('computeWarmth', () => {
  it('is 0 immediately after firstSeenAt', () => {
    expect(computeWarmth(baseState, { enabled: true, sensitivity: 1 }, 0)).toBe(0);
  });
  it('is sensitivity at 1 year', () => {
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    expect(computeWarmth(baseState, { enabled: true, sensitivity: 0.3 }, oneYear)).toBeCloseTo(0.3, 5);
  });
  it('caps at sensitivity beyond 1 year', () => {
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;
    expect(computeWarmth(baseState, { enabled: true, sensitivity: 0.3 }, twoYears)).toBeCloseTo(0.3, 5);
  });
  it('is 0 when disabled', () => {
    expect(computeWarmth(baseState, { enabled: false, sensitivity: 1 }, 1e12)).toBe(0);
  });
});

describe('applyPageWarmth', () => {
  it('sets the CSS variable on the target', () => {
    const win = new Window();
    const el = win.document.documentElement as unknown as HTMLElement;
    applyPageWarmth(0.42, el);
    expect(el.style.getPropertyValue('--shippie-patina-warmth')).toBe('0.420');
  });
});
