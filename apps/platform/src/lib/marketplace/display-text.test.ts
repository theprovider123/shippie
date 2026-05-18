import { describe, expect, it } from 'vitest';
import {
  BLURB_MAX,
  TITLE_MAX,
  displayCategory,
  formatRecency,
  kindAriaLabel,
  kindPillLabel,
  normaliseBlurb,
  titleCap,
} from './display-text';

describe('displayCategory', () => {
  it('maps known slugs to display labels', () => {
    expect(displayCategory('health-fitness')).toBe('Health & fitness');
    expect(displayCategory('food-drink')).toBe('Food & drink');
    expect(displayCategory('games')).toBe('Games');
  });

  it('title-cases unknown slugs as a fallback', () => {
    expect(displayCategory('ux-research')).toBe('Ux Research');
    expect(displayCategory('finance_tools')).toBe('Finance Tools');
  });

  it('defaults to Tools for missing input', () => {
    expect(displayCategory(null)).toBe('Tools');
    expect(displayCategory(undefined)).toBe('Tools');
    expect(displayCategory('')).toBe('Tools');
  });
});

describe('titleCap', () => {
  it('returns trimmed title when under the cap', () => {
    expect(titleCap('  Lift  ')).toBe('Lift');
  });

  it('truncates at TITLE_MAX with an ellipsis', () => {
    const long = 'A'.repeat(TITLE_MAX + 8);
    const out = titleCap(long);
    expect(out.length).toBe(TITLE_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles nullish input', () => {
    expect(titleCap(null)).toBe('');
    expect(titleCap(undefined)).toBe('');
  });
});

describe('normaliseBlurb', () => {
  it('returns the trimmed blurb when under the cap', () => {
    const input = 'A private strength tracker for the minute between sets.';
    expect(normaliseBlurb(input)).toBe(input);
  });

  it('collapses internal whitespace', () => {
    expect(normaliseBlurb('foo   bar\n\tbaz')).toBe('foo bar baz');
  });

  it('clips long blurbs at a word boundary when possible', () => {
    const long = 'Track every lift, hydrate between sets, watch your streak build over weeks of consistent training and recovery cycles.';
    const out = normaliseBlurb(long);
    expect(out.length).toBeLessThanOrEqual(BLURB_MAX + 1);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it('handles nullish input', () => {
    expect(normaliseBlurb(null)).toBe('');
  });
});

describe('formatRecency', () => {
  const NOW = 1_700_000_000_000;

  it('returns "Just now" for under an hour', () => {
    expect(formatRecency(NOW - 30 * 1000, NOW)).toBe('Just now');
    expect(formatRecency(NOW - 59 * 60 * 1000, NOW)).toBe('Just now');
  });

  it('returns "Opened today" for under 24h', () => {
    expect(formatRecency(NOW - 5 * 60 * 60 * 1000, NOW)).toBe('Opened today');
  });

  it('returns days-ago for 1-6 days', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(formatRecency(NOW - 1 * day - 60 * 1000, NOW)).toBe('Opened 1 day ago');
    expect(formatRecency(NOW - 3 * day - 60 * 1000, NOW)).toBe('Opened 3 days ago');
  });

  it('returns null beyond 7 days', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(formatRecency(NOW - 8 * day, NOW)).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(formatRecency(null)).toBeNull();
    expect(formatRecency('not a date')).toBeNull();
  });
});

describe('kind labels', () => {
  it('pill labels are short and lowercase', () => {
    expect(kindPillLabel('local')).toBe('local');
    expect(kindPillLabel('connected')).toBe('connected');
    expect(kindPillLabel('cloud')).toBe('cloud');
    expect(kindPillLabel(null)).toBeNull();
  });

  it('aria labels are full sentences', () => {
    expect(kindAriaLabel('local')).toMatch(/Local/);
    expect(kindAriaLabel('connected')).toMatch(/local data/);
    expect(kindAriaLabel('cloud')).toMatch(/maker/);
  });
});
