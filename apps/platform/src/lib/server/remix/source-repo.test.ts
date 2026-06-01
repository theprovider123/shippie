import { describe, expect, test } from 'vitest';
import { normalizeSourceRepo } from './source-repo';

describe('normalizeSourceRepo', () => {
  test('normalizes GitHub tree URLs while forking the repo root', () => {
    const source = normalizeSourceRepo(
      'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
    );

    expect(source).toEqual({
      webUrl: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
      cloneUrl: 'https://github.com/theprovider123/shippie.git',
      forkUrl: 'https://github.com/theprovider123/shippie/fork',
      owner: 'theprovider123',
      repo: 'shippie',
      ref: 'main',
      path: 'apps/showcase-snake',
    });
  });

  test('normalizes GitHub repo clone URLs', () => {
    const source = normalizeSourceRepo('https://token@github.com/acme/recipes.git?x=1#readme');

    expect(source?.webUrl).toBe('https://github.com/acme/recipes');
    expect(source?.cloneUrl).toBe('https://github.com/acme/recipes.git');
    expect(source?.forkUrl).toBe('https://github.com/acme/recipes/fork');
  });

  test('allows non-GitHub HTTP sources without a fork URL', () => {
    const source = normalizeSourceRepo('https://git.example.com/team/field-notes');

    expect(source?.webUrl).toBe('https://git.example.com/team/field-notes');
    expect(source?.forkUrl).toBeNull();
  });

  test('rejects non-http source URLs', () => {
    expect(normalizeSourceRepo('javascript:alert(1)')).toBeNull();
    expect(normalizeSourceRepo('/relative/repo')).toBeNull();
  });
});
