import { describe, expect, test } from 'vitest';
import { moderateFeedback } from './feedback';

describe('moderateFeedback', () => {
  test('keeps normal feedback open', () => {
    expect(moderateFeedback({ type: 'idea', title: 'Export button', body: 'Please add CSV export.', rating: null }))
      .toEqual({ status: 'open', flags: [] });
  });

  test('hides obvious spam', () => {
    const result = moderateFeedback({
      type: 'other',
      title: 'Free crypto',
      body: 'free crypto casino https://a.test https://b.test https://c.test',
      rating: null,
    });
    expect(result.status).toBe('spam');
    expect(result.flags).toContain('many-links');
  });

  test('queues risky claims for review', () => {
    const result = moderateFeedback({
      type: 'bug',
      title: 'medical diagnosis claim',
      body: 'This app says diagnosis is guaranteed.',
      rating: 1,
    });
    expect(result.status).toBe('reviewing');
    expect(result.flags).toContain('review-language');
  });
});
