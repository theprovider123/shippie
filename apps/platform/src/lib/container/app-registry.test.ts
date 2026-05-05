import { describe, expect, test } from 'vitest';
import { findRequestedApp } from './app-registry';
import { curatedApps } from './state';

describe('findRequestedApp', () => {
  test('resolves public runtime aliases to curated container slugs', () => {
    const app = findRequestedApp(curatedApps, 'recipe');
    expect(app?.slug).toBe('recipe');
    expect(app?.standaloneUrl).toBe('/run/recipe');
  });

  test('resolves legacy recipe-saver requests to the source slug', () => {
    const app = findRequestedApp(curatedApps, 'recipe-saver');
    expect(app?.slug).toBe('recipe');
  });
});
