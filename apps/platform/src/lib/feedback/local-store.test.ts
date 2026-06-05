import { describe, expect, test } from 'vitest';
import { mergeLocalEntry, type LocalFeedbackEntry } from './local-store';

const entry = (id: string, createdAt = '2026-06-05T00:00:00Z'): LocalFeedbackEntry => ({
  id,
  appSlug: 'app',
  type: 'idea',
  message: 'note',
  createdAt,
});

describe('mergeLocalEntry', () => {
  test('prepends the newest entry', () => {
    const out = mergeLocalEntry([entry('a')], entry('b'));
    expect(out.map((e) => e.id)).toEqual(['b', 'a']);
  });

  test('dedupes by id (re-recording moves it to front, no dupes)', () => {
    const out = mergeLocalEntry([entry('a'), entry('b')], entry('a'));
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect(out).toHaveLength(2);
  });

  test('caps the list', () => {
    const list = Array.from({ length: 5 }, (_, i) => entry(`e${i}`));
    const out = mergeLocalEntry(list, entry('new'), 3);
    expect(out.map((e) => e.id)).toEqual(['new', 'e0', 'e1']);
  });
});
