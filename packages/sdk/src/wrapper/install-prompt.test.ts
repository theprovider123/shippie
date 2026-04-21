// packages/sdk/src/wrapper/install-prompt.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  computePromptTier,
  recordVisit,
  recordDismissal,
  recordMeaningfulAction,
  isDismissedRecently,
  type PromptState,
  type PromptTier,
} from './install-prompt.ts';

const NOW = 1_760_000_000_000; // fixed ms epoch for deterministic tests

function freshState(): PromptState {
  return {
    visit_count: 0,
    first_visit_at: NOW,
    last_visit_at: NOW,
    dwell_ms: 0,
    meaningful_actions: 0,
    last_dismissed_at: null,
  };
}

describe('computePromptTier', () => {
  test('visit 1, no dwell → none (nav pill only)', () => {
    const s = freshState();
    s.visit_count = 1;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('none');
  });

  test('visit 1, >60s dwell → soft banner', () => {
    const s = freshState();
    s.visit_count = 1;
    s.dwell_ms = 61_000;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('soft');
  });

  test('visit 2 → soft banner', () => {
    const s = freshState();
    s.visit_count = 2;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('soft');
  });

  test('visit 3 → full sheet', () => {
    const s = freshState();
    s.visit_count = 3;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });

  test('any visit + meaningful action → full sheet', () => {
    const s = freshState();
    s.visit_count = 1;
    s.meaningful_actions = 1;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });

  test('dismissed within 14 days → none', () => {
    const s = freshState();
    s.visit_count = 5;
    s.meaningful_actions = 3;
    s.last_dismissed_at = NOW - 10 * 86_400_000; // 10 days ago
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('none');
  });

  test('dismissed 15 days ago → tier applies again', () => {
    const s = freshState();
    s.visit_count = 3;
    s.last_dismissed_at = NOW - 15 * 86_400_000;
    expect(computePromptTier(s, NOW)).toBe<PromptTier>('full');
  });
});

describe('recordVisit', () => {
  test('first visit starts counter at 1 with first_visit_at set', () => {
    const s = recordVisit(null, NOW);
    expect(s.visit_count).toBe(1);
    expect(s.first_visit_at).toBe(NOW);
    expect(s.last_visit_at).toBe(NOW);
  });

  test('second visit within 30 min does not increment', () => {
    const s1 = recordVisit(null, NOW);
    const s2 = recordVisit(s1, NOW + 5 * 60_000); // +5 min
    expect(s2.visit_count).toBe(1);
    expect(s2.last_visit_at).toBe(NOW + 5 * 60_000);
  });

  test('return visit after 30 min increments', () => {
    const s1 = recordVisit(null, NOW);
    const s2 = recordVisit(s1, NOW + 45 * 60_000); // +45 min
    expect(s2.visit_count).toBe(2);
  });
});

describe('recordDismissal / isDismissedRecently', () => {
  test('fresh state is not dismissed', () => {
    expect(isDismissedRecently(freshState(), NOW)).toBe(false);
  });

  test('just-dismissed state is dismissed', () => {
    const s = recordDismissal(freshState(), NOW);
    expect(isDismissedRecently(s, NOW)).toBe(true);
  });

  test('dismissal expires at day 14', () => {
    const s = recordDismissal(freshState(), NOW);
    expect(isDismissedRecently(s, NOW + 13 * 86_400_000)).toBe(true);
    expect(isDismissedRecently(s, NOW + 15 * 86_400_000)).toBe(false);
  });
});

describe('recordMeaningfulAction', () => {
  test('increments meaningful_actions', () => {
    let s = freshState();
    s = recordMeaningfulAction(s);
    expect(s.meaningful_actions).toBe(1);
    s = recordMeaningfulAction(s);
    expect(s.meaningful_actions).toBe(2);
  });
});
