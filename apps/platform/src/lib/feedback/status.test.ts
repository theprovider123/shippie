import { describe, expect, test } from 'vitest';
import {
  MAKER_STATUSES,
  isMakerStatus,
  makerStatusLabel,
  userStatusLabel,
} from './status';
import { feedbackPreview, toUserFeedbackView } from './history';

describe('isMakerStatus', () => {
  test('accepts only the four maker triage statuses', () => {
    for (const s of MAKER_STATUSES) expect(isMakerStatus(s)).toBe(true);
    for (const s of ['reviewing', 'spam', 'hidden', 'resolved', 'bogus', '', null, 3]) {
      expect(isMakerStatus(s)).toBe(false);
    }
  });
});

describe('makerStatusLabel', () => {
  test('labels the triage pipeline and folds moderation into "In review"', () => {
    expect(makerStatusLabel('open')).toBe('Open');
    expect(makerStatusLabel('planned')).toBe('Planned');
    expect(makerStatusLabel('fixed')).toBe('Fixed');
    expect(makerStatusLabel('closed')).toBe('Closed');
    expect(makerStatusLabel('reviewing')).toBe('In review');
    expect(makerStatusLabel('spam')).toBe('In review');
  });
});

describe('userStatusLabel — never leaks moderation verdicts', () => {
  test('triage statuses map to clear labels + tones', () => {
    expect(userStatusLabel('open')).toEqual({ label: 'Open', tone: 'open' });
    expect(userStatusLabel('planned')).toEqual({ label: 'Planned', tone: 'progress' });
    expect(userStatusLabel('fixed')).toEqual({ label: 'Fixed', tone: 'done' });
    expect(userStatusLabel('closed')).toEqual({ label: 'Closed', tone: 'done' });
  });

  test('reviewing/spam/hidden/unknown collapse to a neutral "Submitted"', () => {
    for (const s of ['reviewing', 'spam', 'hidden', 'whatever']) {
      const v = userStatusLabel(s);
      expect(v).toEqual({ label: 'Submitted', tone: 'pending' });
      expect(v.label.toLowerCase()).not.toContain('spam');
      expect(v.label.toLowerCase()).not.toContain('review');
      expect(v.label.toLowerCase()).not.toContain('hidden');
    }
  });
});

describe('feedbackPreview', () => {
  test('prefers body, collapses whitespace, falls back to title', () => {
    expect(feedbackPreview('  hello\n  world ', 'T')).toBe('hello world');
    expect(feedbackPreview(null, 'just a title')).toBe('just a title');
    expect(feedbackPreview(null, null)).toBe('');
  });

  test('truncates with an ellipsis', () => {
    const out = feedbackPreview('z'.repeat(200), null, 140);
    expect(out.length).toBe(140);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('toUserFeedbackView', () => {
  const base = {
    id: 'fb_1',
    appSlug: 'wedding-demo',
    appName: 'Wedding Demo',
    type: 'bug',
    title: null,
    body: 'export is broken',
    status: 'planned',
    makerReply: 'Thanks — fixing this week.',
    makerReplyAt: '2026-06-05T10:00:00Z',
    createdAt: '2026-06-04T09:00:00Z',
  };

  test('shapes a safe view with the user-facing status + body preview', () => {
    expect(toUserFeedbackView(base)).toEqual({
      id: 'fb_1',
      appSlug: 'wedding-demo',
      appName: 'Wedding Demo',
      type: 'bug',
      preview: 'export is broken',
      status: 'Planned',
      tone: 'progress',
      makerReply: 'Thanks — fixing this week.',
      makerReplyAt: '2026-06-05T10:00:00Z',
      createdAt: '2026-06-04T09:00:00Z',
    });
  });

  test('a flagged item never surfaces its verdict to the user', () => {
    const v = toUserFeedbackView({ ...base, status: 'spam', makerReply: null, makerReplyAt: null });
    expect(v.status).toBe('Submitted');
    expect(v.tone).toBe('pending');
  });
});
