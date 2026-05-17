import { describe, expect, test } from 'bun:test';
import { fallbackLiveScore, loadTodayScores, provenanceLabel } from './live-scores-client.ts';

describe('live scores client', () => {
  test('falls back cleanly when the platform API is unavailable', async () => {
    const scores = await loadTodayScores(async () => {
      throw new Error('offline');
    });
    expect(scores[0]?.provenance).toBe('manual-ready');
    expect(provenanceLabel(fallbackLiveScore().provenance)).toBe('Awaiting kickoff');
  });
});
