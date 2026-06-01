import { describe, expect, test } from 'vitest';
import { remixSlugCandidate, suggestRemixSlug } from './handoff';

function takenLookup(taken: Iterable<string>) {
  const takenSet = new Set(taken);
  return (slug: string) => Promise.resolve(takenSet.has(slug));
}

describe('remix handoff slug suggestions', () => {
  test('uses slug-remix for the first available target', async () => {
    await expect(
      suggestRemixSlug({} as never, 'recipe-saver', new Set(), { slugExists: takenLookup([]) }),
    ).resolves.toBe(
      'recipe-saver-remix',
    );
  });

  test('skips taken and reserved remix targets', async () => {
    await expect(
      suggestRemixSlug(
        {} as never,
        'recipe-saver',
        new Set(['recipe-saver-remix']),
        { slugExists: takenLookup(['recipe-saver-remix-2']) },
      ),
    ).resolves.toBe('recipe-saver-remix-3');
  });

  test('truncates long parents before appending the suffix', () => {
    const candidate = remixSlugCandidate('a'.repeat(63));
    expect(candidate).toHaveLength(63);
    expect(candidate.endsWith('-remix')).toBe(true);
  });
});
