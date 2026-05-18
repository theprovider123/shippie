import { describe, expect, test } from 'vitest';
import { remixEligibilityForSlug } from './eligibility';

function dbReturning(row: Record<string, unknown> | undefined) {
  return {
    select() {
      return {
        from() {
          return this;
        },
        leftJoin() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return Promise.resolve(row ? [row] : []);
        },
      };
    },
  } as never;
}

describe('remixEligibilityForSlug', () => {
  test('allows first-party showcases from the central open-source repo', async () => {
    await expect(
      remixEligibilityForSlug(dbReturning({
        id: 'app-coffee',
        slug: 'coffee',
        name: 'Coffee',
        tagline: 'Brew better.',
        visibilityScope: 'public',
        isArchived: false,
        githubRepo: null,
        sourceRepo: null,
        license: null,
        remixAllowed: false,
      }), 'coffee'),
    ).resolves.toEqual({
      ok: true,
      app: {
        id: 'app-coffee',
        slug: 'coffee',
        name: 'Coffee',
        tagline: 'Brew better.',
        templateId: 'showcase:coffee',
        sourceRepo: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-coffee',
        license: 'AGPL-3.0-or-later',
        latestVersion: null,
      },
    });
  });

  test('first-party showcases stay remixable even if the maker row sets remixAllowed: true with empty source/license', async () => {
    // Regression: prior behaviour required `!row.remixAllowed` to enter the
    // first-party fallback. If a maker row had `remixAllowed: true` but no
    // `sourceRepo` / `license` (the legitimate state for first-party
    // showcases — source lives in the monorepo, not the maker's profile),
    // the helper 400'd. First-party defaults should win unconditionally.
    await expect(
      remixEligibilityForSlug(dbReturning({
        id: 'app-coffee',
        slug: 'coffee',
        name: 'Coffee',
        tagline: 'Brew better.',
        visibilityScope: 'public',
        isArchived: false,
        githubRepo: null,
        sourceRepo: null,
        license: null,
        remixAllowed: true,
      }), 'coffee'),
    ).resolves.toEqual({
      ok: true,
      app: {
        id: 'app-coffee',
        slug: 'coffee',
        name: 'Coffee',
        tagline: 'Brew better.',
        templateId: 'showcase:coffee',
        sourceRepo: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-coffee',
        license: 'AGPL-3.0-or-later',
        latestVersion: null,
      },
    });
  });

  test('does not expose archived first-party showcases for remix', async () => {
    await expect(
      remixEligibilityForSlug(dbReturning({
        id: 'app-atlas',
        slug: 'atlas',
        name: 'Atlas',
        tagline: null,
        visibilityScope: 'public',
        isArchived: false,
        githubRepo: null,
        sourceRepo: null,
        license: null,
        remixAllowed: false,
      }), 'atlas'),
    ).resolves.toEqual({
      ok: false,
      reason: 'The maker has not published source, license, and remix terms.',
    });
  });

  test('allows current first-party catalog apps without a D1 app row', async () => {
    await expect(remixEligibilityForSlug(dbReturning(undefined), 'snake')).resolves.toEqual({
      ok: true,
      app: {
        id: null,
        slug: 'snake',
        name: 'Snake',
        tagline: null,
        templateId: 'showcase:snake',
        sourceRepo: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
        license: 'AGPL-3.0-or-later',
        latestVersion: null,
      },
    });
  });

  test('does not expose archived catalog-only apps', async () => {
    await expect(remixEligibilityForSlug(dbReturning(undefined), 'atlas')).resolves.toEqual({
      ok: false,
      reason: 'This app is not publicly remixable.',
    });
  });
});
