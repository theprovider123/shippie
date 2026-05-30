import { describe, expect, it } from 'bun:test';
import { classifyFailure, createStuckLoopGuard, FAIL_OPEN_CAPABILITIES } from './policy.ts';

describe('classifyFailure', () => {
  it('Vault key unreachable always fails closed with safe-mode hint', () => {
    const d = classifyFailure({ capability: 'db.query', payload: null, failure: 'key-unavailable' });
    expect(d).toEqual({ mode: 'fail-closed', errorCode: 'key-unavailable', safeModeHint: true });
  });

  it('Crypto error always fails closed', () => {
    const d = classifyFailure({ capability: 'intent.consume', payload: null, failure: 'crypto' });
    expect(d.mode).toBe('fail-closed');
  });

  it('allow-listed capabilities fail open with degraded visibility', () => {
    for (const cap of FAIL_OPEN_CAPABILITIES) {
      const d = classifyFailure({ capability: cap, payload: null, failure: 'idb-transient' });
      expect(d.mode).toBe('fail-open-degraded');
    }
  });

  it('ai.run with no egress flag falls into fail-open', () => {
    const d = classifyFailure({ capability: 'ai.run', payload: { task: 'classify' }, failure: 'idb-transient' });
    expect(d.mode).toBe('fail-open-degraded');
  });

  it('ai.run with explicit egress=true falls closed', () => {
    const d = classifyFailure({
      capability: 'ai.run',
      payload: { task: 'classify', egress: true },
      failure: 'idb-transient',
    });
    expect(d.mode).toBe('fail-closed');
  });

  it('intent.consume falls into fail-open under transient failures', () => {
    const d = classifyFailure({ capability: 'intent.consume', payload: { intent: 'cooked-meal' }, failure: 'idb-transient' });
    expect(d.mode).toBe('fail-open-degraded');
  });

  it('intent.provide always falls closed under transient failure', () => {
    const d = classifyFailure({ capability: 'intent.provide', payload: { intent: 'cooked-meal' }, failure: 'idb-transient' });
    expect(d.mode).toBe('fail-closed');
  });

  it('network.fetch always falls closed under transient failure', () => {
    const d = classifyFailure({ capability: 'network.fetch', payload: { url: 'https://palate.app/' }, failure: 'idb-quota' });
    expect(d.mode).toBe('fail-closed');
  });
});

describe('createStuckLoopGuard', () => {
  it('does not fire under the threshold', () => {
    let t = 0;
    const g = createStuckLoopGuard({ threshold: 5, windowMs: 60_000, now: () => t });
    expect(g.recordFailureForApp('recipe')).toBe(false);
    t = 1000;
    expect(g.recordFailureForApp('recipe')).toBe(false);
  });

  it('fires at exactly the threshold inside the window', () => {
    let t = 0;
    const g = createStuckLoopGuard({ threshold: 5, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 4; i++) {
      g.recordFailureForApp('recipe');
      t += 1000;
    }
    expect(g.recordFailureForApp('recipe')).toBe(true);
  });

  it('forgets failures older than the window', () => {
    let t = 0;
    const g = createStuckLoopGuard({ threshold: 5, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 4; i++) {
      g.recordFailureForApp('recipe');
      t += 1000;
    }
    t += 60_000;
    expect(g.recordFailureForApp('recipe')).toBe(false);
  });

  it('separates state per app', () => {
    let t = 0;
    const g = createStuckLoopGuard({ threshold: 3, windowMs: 60_000, now: () => t });
    g.recordFailureForApp('recipe');
    g.recordFailureForApp('recipe');
    expect(g.recordFailureForApp('journal')).toBe(false);
    expect(g.recordFailureForApp('recipe')).toBe(true);
  });

  it('reset clears all', () => {
    const g = createStuckLoopGuard({ threshold: 2 });
    g.recordFailureForApp('recipe');
    g.reset();
    expect(g.recordFailureForApp('recipe')).toBe(false);
  });
});
