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

describe('cannon feed schemas', () => {
  const fixture = {
    id: 'pl-che-2026-08-30', kickoffUtc: '2026-08-30T15:30:00Z', comp: 'Premier League',
    opponent: 'Chelsea', opponentShort: 'CHE', venue: 'H', ground: 'Emirates Stadium',
    tv: null, status: 'scheduled', score: null, difficulty: 'hard',
  };

  it('accepts a valid cannon.fixtures.v1 payload', () => {
    expect(validateFeedPayload('cannon.fixtures.v1', { season: '2026/27', fixtures: [fixture], h2h: {} })).toEqual([]);
  });

  it('rejects fixtures with bad venue, id shape, or kickoff', () => {
    const errors = validateFeedPayload('cannon.fixtures.v1', {
      season: '2026/27',
      fixtures: [{ ...fixture, venue: 'X' }, { ...fixture, id: 'NOT VALID!' }, { ...fixture, kickoffUtc: 'tomorrow' }],
    });
    expect(errors).toHaveLength(3);
  });

  it('accepts cannon.match.v1 through the phase machine', () => {
    const base = { matchId: 'cs-mci-2026-08-16', kickoffUtc: '2026-08-16T14:00:00Z', opponent: 'Man City' };
    for (const phase of ['idle', 'pre', 'live', 'ht', 'ft']) {
      expect(validateFeedPayload('cannon.match.v1', { ...base, phase, score: { home: 1, away: 0 }, events: [{ min: 12, type: 'goal', player: 'Saka' }] })).toEqual([]);
    }
    expect(validateFeedPayload('cannon.match.v1', { ...base, phase: 'et' }).length).toBeGreaterThan(0);
    expect(validateFeedPayload('cannon.match.v1', { ...base, phase: 'live', score: { home: 'one' } }).length).toBeGreaterThan(0);
  });

  it('accepts cannon.squad.v1 and rejects bad availability', () => {
    const player = {
      id: 'saka', num: 7, name: 'Saka', full: 'Bukayo Saka', nat: 'ENG', pos: 'RW', group: 'Forwards',
      availability: 'fit', availabilityNote: null, stats: { apps: 37, goals: 24, assists: 18, rating: 8.4 }, form: ['W'],
    };
    expect(validateFeedPayload('cannon.squad.v1', { players: [player] })).toEqual([]);
    expect(validateFeedPayload('cannon.squad.v1', { players: [{ ...player, availability: 'benched' }] })).toHaveLength(1);
  });

  it('cannon.news.v1 requires an own-words summary and a real link', () => {
    const item = { id: 'n1', title: 'T', summary: 'S', url: 'https://example.com/x', source: 'BBC Sport', publishedAt: '2026-06-10T09:00:00Z' };
    expect(validateFeedPayload('cannon.news.v1', { items: [item] })).toEqual([]);
    expect(validateFeedPayload('cannon.news.v1', { items: [{ ...item, url: 'javascript:alert(1)' }] })).toHaveLength(1);
    expect(validateFeedPayload('cannon.news.v1', { items: [{ ...item, summary: '' }] })).toHaveLength(1);
  });

  it('cannon.club.v1 wants trophies + MM-DD thisDay map', () => {
    expect(validateFeedPayload('cannon.club.v1', { trophies: [], thisDay: { '06-09': { year: '2004', text: 'Invincibles' } } })).toEqual([]);
    expect(validateFeedPayload('cannon.club.v1', { trophies: 'lots', thisDay: [] })).toHaveLength(2);
  });
});
