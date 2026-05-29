import { describe, expect, test } from 'vitest';
import { firstPartyAnalyticsSeed } from './first-party';

describe('first-party analytics seed', () => {
  test('creates a deterministic row for first-party showcase slugs', () => {
    expect(firstPartyAnalyticsSeed('parade-companion')).toMatchObject({
      id: 'app_first_party_parade_companion',
      slug: 'parade-companion',
      name: 'Parade Companion',
      category: 'tools',
      surface: 'labs',
      visibilityScope: 'public',
    });
  });

  test('rejects unknown slugs', () => {
    expect(firstPartyAnalyticsSeed('not-a-real-showcase')).toBeNull();
  });
});
