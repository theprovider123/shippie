/**
 * Summary tests — extractive heuristic + AI wiring.
 */
import { describe, expect, test } from 'bun:test';
import {
  extractiveSummary,
  splitSentences,
  summariseWithFallback,
} from './summarise.ts';

const longText = [
  'Climate models have improved dramatically since the 1990s.',
  'A short note.',
  'The IPCC released its latest synthesis report this week, calling for sharper cuts in the next decade than any prior assessment had requested, and warning that current pledges fall well short of the trajectory needed to limit warming to 1.5 degrees.',
  'Critics say the language is too cautious for the scale of the threat.',
  'Renewables continue to displace coal across most major grids despite supply-chain headwinds and intermittency challenges in regions without sufficient transmission capacity to balance regional generation.',
].join(' ');

describe('splitSentences', () => {
  test('splits on terminators followed by capital letters', () => {
    expect(splitSentences('Hello world. How are you? Fine!')).toEqual([
      'Hello world.',
      'How are you?',
      'Fine!',
    ]);
  });

  test('glues short fragments back to the previous sentence', () => {
    const result = splitSentences('Hello. Mr. Smith arrived.');
    // "Mr." would otherwise split off — short, glued back.
    expect(result.length).toBeLessThan(3);
  });

  test('returns empty array for empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('extractiveSummary', () => {
  test('returns first sentence + longest others up to maxSentences', () => {
    const result = extractiveSummary(longText, { maxSentences: 3 });
    expect(result.source).toBe('extractive');
    expect(result.sentences.length).toBe(3);
    // First sentence is the lede.
    expect(result.sentences[0]).toContain('Climate models');
    // The two long sentences should be picked over "A short note."
    const joined = result.sentences.join(' ');
    expect(joined).toContain('IPCC');
    expect(joined).toContain('Renewables');
    expect(joined).not.toContain('A short note.');
  });

  test('preserves order of selected sentences', () => {
    const result = extractiveSummary(longText, { maxSentences: 3 });
    const indices = result.sentences.map((s) => longText.indexOf(s));
    expect(indices.every((i) => i >= 0)).toBe(true);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  test('returns all sentences when there are fewer than maxSentences', () => {
    const result = extractiveSummary('One. Two.', { maxSentences: 3 });
    expect(result.sentences).toEqual(['One.', 'Two.']);
  });

  test('handles empty input gracefully', () => {
    expect(extractiveSummary('', { maxSentences: 3 }).sentences).toEqual([]);
  });
});

describe('summariseWithFallback', () => {
  test('uses AI summary when worker returns local source', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'summarise' as const,
          output: { sentences: ['AI sentence one.', 'AI sentence two.'] },
          source: 'local' as const,
        }),
      },
    };
    const result = await summariseWithFallback(fakeShippie, longText);
    expect(result.source).toBe('ai');
    expect(result.sentences).toEqual(['AI sentence one.', 'AI sentence two.']);
  });

  test('falls back to extractive when worker is unavailable', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'summarise' as const,
          output: null,
          source: 'unavailable' as const,
        }),
      },
    };
    const result = await summariseWithFallback(fakeShippie, longText, { maxSentences: 2 });
    expect(result.source).toBe('extractive');
    expect(result.sentences.length).toBe(2);
  });

  test('falls back when worker throws', async () => {
    const fakeShippie = {
      ai: {
        run: async () => {
          throw new Error('no transformers');
        },
      },
    };
    const result = await summariseWithFallback(fakeShippie, longText, { maxSentences: 2 });
    expect(result.source).toBe('extractive');
    expect(result.sentences.length).toBe(2);
  });

  test('parses bare-string AI output by splitting client-side', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'summarise' as const,
          output: 'First. Second. Third.',
          source: 'local' as const,
        }),
      },
    };
    const result = await summariseWithFallback(fakeShippie, 'irrelevant', { maxSentences: 2 });
    expect(result.source).toBe('ai');
    expect(result.sentences).toEqual(['First.', 'Second.']);
  });

  test('treats unreadable AI output as unavailable and falls back', async () => {
    const fakeShippie = {
      ai: {
        run: async () => ({
          task: 'summarise' as const,
          output: { weird: 42 },
          source: 'local' as const,
        }),
      },
    };
    const result = await summariseWithFallback(fakeShippie, longText, { maxSentences: 2 });
    expect(result.source).toBe('extractive');
  });
});
