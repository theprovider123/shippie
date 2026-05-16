import { describe, expect, test } from 'vitest';
import { fallbackScore, normaliseFootballDataMatch, normaliseStatus } from './normalise';

describe('match-room score normalisation', () => {
  test('maps provider statuses and scores', () => {
    expect(normaliseStatus('IN_PLAY')).toBe('live');
    const score = normaliseFootballDataMatch({
      id: 1,
      status: 'FINISHED',
      score: { fullTime: { home: 2, away: 1 } },
    });
    expect(score.scoreHome).toBe(2);
    expect(score.scoreAway).toBe(1);
    expect(score.provenance).toBe('provider-delayed');
  });

  test('fallback is manual-ready', () => {
    expect(fallbackScore('match-001').provenance).toBe('manual-ready');
  });
});
