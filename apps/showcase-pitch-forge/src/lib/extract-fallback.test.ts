import { describe, expect, test } from 'bun:test';
import { extractKeySentences, scoreSentence, splitSentences } from './extract-fallback.ts';

describe('splitSentences', () => {
  test('handles single sentence', () => {
    expect(splitSentences('We help small farms.')).toEqual(['We help small farms.']);
  });

  test('handles multiple sentences with mixed punctuation', () => {
    const out = splitSentences('Why bother? Because the data shows it works! Read on.');
    expect(out).toEqual([
      'Why bother?',
      'Because the data shows it works!',
      'Read on.',
    ]);
  });

  test('treats paragraph breaks as sentence boundaries', () => {
    const out = splitSentences('First paragraph here\n\nSecond paragraph');
    expect(out.length).toBe(2);
    expect(out[0]).toContain('First');
    expect(out[1]).toContain('Second');
  });

  test('returns empty array on empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n\n  ')).toEqual([]);
  });
});

describe('scoreSentence', () => {
  test('budget kind boosts sentences with dollar amounts', () => {
    const withMoney = scoreSentence('The budget is $50,000 across three quarters.', 'budget', 0.5);
    const without = scoreSentence('We will work hard on this very interesting project for a long time.', 'budget', 0.5);
    expect(withMoney).toBeGreaterThan(without);
  });

  test('timeline kind boosts sentences with weeks/phases', () => {
    const timely = scoreSentence('Phase 1 runs for six weeks then we ship.', 'timeline', 0.5);
    const not = scoreSentence('We are passionate about this.', 'timeline', 0.5);
    expect(timely).toBeGreaterThan(not);
  });

  test('penalises very short sentences', () => {
    const tiny = scoreSentence('Yes.', 'summary', 0.5);
    expect(tiny).toBeLessThan(0);
  });
});

describe('extractKeySentences', () => {
  const BRIEF = `
We are launching FarmConnect, a small-grower marketplace serving 200 farms across the upper Midwest.
The problem: independent farmers lose 30% of their margin to brokers who add no value.
Our approach is a mobile app that connects buyers directly with farms.
We will hire two full-time engineers and one community manager.
The budget is $180,000 over twelve months, mostly salary.
Phase 1 lasts eight weeks: build a web prototype.
Phase 2 lasts twelve weeks: ship the mobile app.
We expect to onboard 50 farms and 5 wholesalers in year one.
  `.trim();

  test('returns markdown bullets', () => {
    const out = extractKeySentences(BRIEF, { kind: 'budget' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.startsWith('- ')).toBe(true);
  });

  test('budget extraction surfaces dollar amounts', () => {
    const out = extractKeySentences(BRIEF, { kind: 'budget' });
    expect(out).toContain('$180,000');
  });

  test('timeline extraction surfaces phases/weeks', () => {
    const out = extractKeySentences(BRIEF, { kind: 'timeline', topN: 3 });
    expect(out.toLowerCase()).toMatch(/phase|week/);
  });

  test('topN caps the number of bullets', () => {
    const out = extractKeySentences(BRIEF, { kind: 'summary', topN: 2 });
    const bullets = out.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets.length).toBeLessThanOrEqual(2);
  });

  test('empty brief returns empty string', () => {
    expect(extractKeySentences('', { kind: 'summary' })).toBe('');
    expect(extractKeySentences('   ', { kind: 'summary' })).toBe('');
  });
});
