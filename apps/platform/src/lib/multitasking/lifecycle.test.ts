import { describe, expect, it } from 'vitest';
import {
  MAX_BACKGROUND_BUDGET_MS,
  canTransition,
  grantBackgroundTask,
  isGrantExpired,
  next,
} from './lifecycle';

describe('lifecycle state machine', () => {
  it('running --blur--> paused, --snapshot--> suspended', () => {
    expect(next('running', 'blur')).toBe('paused');
    expect(next('running', 'snapshot')).toBe('suspended');
  });

  it('paused --focus--> running, --evict--> evicted', () => {
    expect(next('paused', 'focus')).toBe('running');
    expect(next('paused', 'evict')).toBe('evicted');
  });

  it('suspended --restore--> paused, --evict--> evicted', () => {
    expect(next('suspended', 'restore')).toBe('paused');
    expect(next('suspended', 'evict')).toBe('evicted');
  });

  it('evicted --restore--> running (cold reload)', () => {
    expect(next('evicted', 'restore')).toBe('running');
  });

  it('rejects invalid transitions', () => {
    expect(() => next('running', 'restore')).toThrow();
    expect(() => next('evicted', 'focus')).toThrow();
  });

  it('canTransition mirrors the transition table', () => {
    expect(canTransition('running', 'blur')).toBe(true);
    expect(canTransition('running', 'restore')).toBe(false);
  });
});

describe('background task grant', () => {
  it('grants the requested budget', () => {
    const grant = grantBackgroundTask({ appSlug: 'recipe', taskName: 'sync', budgetMs: 60_000 }, 1_000);
    expect(grant).toEqual({
      appSlug: 'recipe',
      taskName: 'sync',
      grantedAt: 1_000,
      expiresAt: 61_000,
    });
  });

  it('rejects non-positive budgets', () => {
    expect(() => grantBackgroundTask({ appSlug: 'r', taskName: 't', budgetMs: 0 })).toThrow();
    expect(() => grantBackgroundTask({ appSlug: 'r', taskName: 't', budgetMs: -1 })).toThrow();
  });

  it('rejects budgets above the spec cap', () => {
    expect(() =>
      grantBackgroundTask({ appSlug: 'r', taskName: 't', budgetMs: MAX_BACKGROUND_BUDGET_MS + 1 }),
    ).toThrow();
  });

  it('isGrantExpired flips at expiresAt', () => {
    const grant = grantBackgroundTask({ appSlug: 'r', taskName: 't', budgetMs: 1_000 }, 1_000);
    expect(isGrantExpired(grant, 1_500)).toBe(false);
    expect(isGrantExpired(grant, 2_000)).toBe(true);
  });
});
