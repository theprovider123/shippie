import { describe, expect, test } from 'vitest';
import { checkAppSlugAvailability } from './slug-availability';

function dbWithResults(results: unknown[][]) {
  const calls: string[] = [];
  return {
    calls,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.push('select');
            return results.shift() ?? [];
          },
        }),
      }),
    }),
  };
}

describe('checkAppSlugAvailability', () => {
  test('rejects invalid slugs before querying', async () => {
    const db = dbWithResults([]);
    await expect(checkAppSlugAvailability(db as never, 'Bad Slug!')).resolves.toMatchObject({
      available: false,
      reason: 'invalid',
    });
    expect(db.calls).toEqual([]);
  });

  test('rejects reserved platform route slugs', async () => {
    const db = dbWithResults([]);
    await expect(
      checkAppSlugAvailability(db as never, 'docs', { reservedSlugs: new Set(['docs']) }),
    ).resolves.toMatchObject({
      available: false,
      reason: 'reserved',
    });
    expect(db.calls).toEqual([]);
  });

  test('rejects first-party app and alias slugs', async () => {
    const db = dbWithResults([]);
    await expect(checkAppSlugAvailability(db as never, 'golazo')).resolves.toMatchObject({
      available: false,
      reason: 'first_party',
    });
    await expect(checkAppSlugAvailability(db as never, 'recipe')).resolves.toMatchObject({
      available: false,
      reason: 'first_party',
    });
  });

  test('rejects active app slugs owned by another app', async () => {
    const db = dbWithResults([
      [],
      [{ id: 'app_other' }],
    ]);
    await expect(checkAppSlugAvailability(db as never, 'taken', { excludeAppId: 'app_mine' })).resolves.toMatchObject({
      available: false,
      reason: 'active_app',
      ownerAppId: 'app_other',
    });
  });

  test('allows the current app slug while checking later alias tables', async () => {
    const db = dbWithResults([
      [],
      [{ id: 'app_mine' }],
      [],
      [],
    ]);
    await expect(checkAppSlugAvailability(db as never, 'mine', { excludeAppId: 'app_mine' })).resolves.toMatchObject({
      available: true,
      reason: 'available',
    });
  });

  test('rejects retired aliases for other apps', async () => {
    const db = dbWithResults([
      [],
      [],
      [{ appId: 'app_other', targetSlug: 'new-home' }],
    ]);
    await expect(checkAppSlugAvailability(db as never, 'old-home', { excludeAppId: 'app_mine' })).resolves.toMatchObject({
      available: false,
      reason: 'retired_alias',
      ownerAppId: 'app_other',
      targetSlug: 'new-home',
    });
  });

  test('allows an app to reclaim its own retired alias', async () => {
    const db = dbWithResults([
      [],
      [],
      [{ appId: 'app_mine', targetSlug: 'current' }],
      [],
    ]);
    await expect(checkAppSlugAvailability(db as never, 'old-home', { excludeAppId: 'app_mine' })).resolves.toMatchObject({
      available: true,
      reason: 'available',
    });
  });
});
