import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { loadPatinaState, savePatinaState, _resetPatinaDbForTest } from './storage.ts';

beforeEach(async () => {
  await _resetPatinaDbForTest();
});

describe('patina storage', () => {
  it('returns null when no record exists yet', async () => {
    const state = await loadPatinaState();
    expect(state).toBeNull();
  });

  it('round-trips a state', async () => {
    const initial = {
      firstSeenAt: 1700_000_000_000,
      lastSeenAt: 1700_001_000_000,
      sessionCount: 5,
      milestonesFired: [],
    };
    await savePatinaState(initial);
    const loaded = await loadPatinaState();
    expect(loaded).toEqual(initial);
  });

  it('overwrites on second save', async () => {
    await savePatinaState({ firstSeenAt: 1, lastSeenAt: 2, sessionCount: 1, milestonesFired: [] });
    await savePatinaState({ firstSeenAt: 1, lastSeenAt: 3, sessionCount: 2, milestonesFired: [] });
    const loaded = await loadPatinaState();
    expect(loaded?.sessionCount).toBe(2);
  });
});
