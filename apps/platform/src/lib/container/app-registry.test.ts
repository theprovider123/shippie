import { describe, expect, test } from 'vitest';
import { findRequestedApp } from './app-registry';
import { curatedApps } from './state';

describe('findRequestedApp', () => {
  test('resolves public runtime aliases to curated container slugs', () => {
    const app = findRequestedApp(curatedApps, 'recipe');
    expect(app?.slug).toBe('recipe-saver');
    expect(app?.standaloneUrl).toBe('/run/recipe');
  });
});
