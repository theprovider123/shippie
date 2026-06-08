import { describe, expect, it } from 'vitest';
import { validateFeedPayload, isKnownSchema } from './schemas';

describe('validateFeedPayload', () => {
  it('accepts a valid golazo.scores.v1 payload', () => {
    const payload = { updatedAt: 't', news: [], live: [{ matchId: 'm1', home: 'ENG', away: 'FRA', homeGoals: 1, awayGoals: 0, status: 'live' }] };
    expect(validateFeedPayload('golazo.scores.v1', payload)).toEqual([]);
  });

  it('rejects scores with a bad status or missing matchId', () => {
    const bad = { live: [{ matchId: '', home: 'ENG', away: 'FRA', status: 'paused' }] };
    const errors = validateFeedPayload('golazo.scores.v1', bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects scores where live is not an array', () => {
    expect(validateFeedPayload('golazo.scores.v1', { live: {} }).length).toBeGreaterThan(0);
  });

  it('accepts golazo.results.v1 with object groups/knockout', () => {
    expect(validateFeedPayload('golazo.results.v1', { groups: {}, knockout: {} })).toEqual([]);
  });

  it('rejects an unknown schema', () => {
    expect(validateFeedPayload('mystery.v9', {})).toEqual(['unknown dataSchema: mystery.v9']);
  });

  it('lets the *.raw.v1 escape hatch pass any object or array', () => {
    expect(validateFeedPayload('anything.raw.v1', { x: 1 })).toEqual([]);
    expect(validateFeedPayload('anything.raw.v1', [1, 2, 3])).toEqual([]);
    expect(validateFeedPayload('anything.raw.v1', 'nope').length).toBeGreaterThan(0);
  });
});

describe('isKnownSchema', () => {
  it('knows registered + raw schemas', () => {
    expect(isKnownSchema('golazo.scores.v1')).toBe(true);
    expect(isKnownSchema('foo.raw.v1')).toBe(true);
    expect(isKnownSchema('foo.v1')).toBe(false);
  });
});
