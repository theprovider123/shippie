import { describe, expect, test } from 'vitest';
import {
  OPEN_EVENTS,
  feedbackPreviewLabel,
  feedbackPromptKind,
  proofSummary,
  sortFeedbackPreviewRows,
  toFeedbackPreview,
  usagePromptKind,
  zeroFillOpens,
  type FeedbackPreviewRow,
} from './app-health';

function feedbackRow(overrides: Partial<FeedbackPreviewRow>): FeedbackPreviewRow {
  return {
    id: 'feedback-a',
    type: 'bug',
    title: null,
    body: null,
    voteCount: 0,
    createdAt: '2026-06-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('maker app health helpers', () => {
  test('uses only the app open analytics events for Home opens', () => {
    expect([...OPEN_EVENTS]).toEqual(['app_open', 'opened']);
    expect(OPEN_EVENTS).not.toContain('installed');
    expect(OPEN_EVENTS).not.toContain('keyboard_open_in_tool');
  });

  test('zero fills the trailing day window in UTC order', () => {
    expect(
      zeroFillOpens(
        [
          { date: '2026-05-30', opens: 99 },
          { date: '2026-06-02', opens: 2 },
          { date: '2026-06-04', opens: 5 },
        ],
        new Date('2026-06-04T23:15:00.000Z'),
        4,
      ),
    ).toEqual([
      { date: '2026-06-01', opens: 0 },
      { date: '2026-06-02', opens: 2 },
      { date: '2026-06-03', opens: 0 },
      { date: '2026-06-04', opens: 5 },
    ]);
  });

  test('orders feedback previews by votes, recency, then id', () => {
    const sorted = sortFeedbackPreviewRows([
      feedbackRow({ id: 'tie-a', voteCount: 2, createdAt: '2026-06-03T09:00:00.000Z' }),
      feedbackRow({ id: 'newer', voteCount: 2, createdAt: '2026-06-04T09:00:00.000Z' }),
      feedbackRow({ id: 'top', voteCount: 5, createdAt: '2026-06-01T09:00:00.000Z' }),
      feedbackRow({ id: 'tie-z', voteCount: 2, createdAt: '2026-06-03T09:00:00.000Z' }),
    ]);

    expect(sorted.map((row) => row.id)).toEqual(['top', 'newer', 'tie-z', 'tie-a']);
  });

  test('builds readable feedback preview labels', () => {
    expect(feedbackPreviewLabel(feedbackRow({ title: '  Better filters  ', body: 'ignored' }))).toBe(
      'Better filters',
    );
    expect(feedbackPreviewLabel(feedbackRow({ body: '  line one\n\nline two  ' }))).toBe('line one line two');

    const longLabel = feedbackPreviewLabel(feedbackRow({ body: 'a'.repeat(90) }));
    expect(longLabel).toHaveLength(84);
    expect(longLabel.endsWith('...')).toBe(true);

    expect(feedbackPreviewLabel(feedbackRow({ type: 'idea' }))).toBe('idea');
  });

  test('maps preview rows without changing already-deterministic order', () => {
    expect(
      toFeedbackPreview([
        feedbackRow({ id: 'first', title: 'First', voteCount: 3 }),
        feedbackRow({ id: 'second', body: 'Second body', voteCount: 1 }),
      ]),
    ).toEqual([
      {
        id: 'first',
        label: 'First',
        voteCount: 3,
        createdAt: '2026-06-04T12:00:00.000Z',
      },
      {
        id: 'second',
        label: 'Second body',
        voteCount: 1,
        createdAt: '2026-06-04T12:00:00.000Z',
      },
    ]);
  });

  test('keeps empty-state prompts compact and state-driven', () => {
    expect(feedbackPromptKind(0)).toBe('prompt');
    expect(feedbackPromptKind(1)).toBe('hidden');
    expect(usagePromptKind(0)).toBe('prompt');
    expect(usagePromptKind(7)).toBe('hidden');
  });

  test('only shows proof summary after earned badges or proof events', () => {
    expect(proofSummary({ earnedBadges: [], proofEventCount: 0, totalBadges: 3 })).toEqual({
      show: false,
      earned: 0,
      total: 3,
      glyphs: '◇◇◇',
    });
    expect(
      proofSummary({ earnedBadges: ['works-offline', 'runs-local-db'], proofEventCount: 0, totalBadges: 3 }),
    ).toEqual({
      show: true,
      earned: 2,
      total: 3,
      glyphs: '◆◆◇',
    });
    expect(proofSummary({ earnedBadges: [], proofEventCount: 4, totalBadges: 3 }).show).toBe(true);
  });
});
