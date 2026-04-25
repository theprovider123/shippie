import { describe, expect, test } from 'bun:test';
import { manifestFromProfile } from './smart-defaults.ts';

const fallback = {
  themeColor: '#E8603C',
  backgroundColor: '#14120F',
  appName: 'My App',
};

describe('manifestFromProfile', () => {
  test('uses profile primaryColor when present', () => {
    const out = manifestFromProfile(
      {
        inferredName: 'Recipe Saver',
        design: { primaryColor: '#FF7259', backgroundColor: '#FAF7EF', iconHrefs: [] },
      },
      fallback,
    );
    expect(out.theme_color).toBe('#FF7259');
    expect(out.background_color).toBe('#FAF7EF');
  });

  test('falls back when primary colour is null', () => {
    const out = manifestFromProfile(
      {
        inferredName: 'X',
        design: { primaryColor: null, backgroundColor: null, iconHrefs: [] },
      },
      fallback,
    );
    expect(out.theme_color).toBe(fallback.themeColor);
    expect(out.background_color).toBe(fallback.backgroundColor);
  });

  test('uses inferredName when present, fallback appName otherwise', () => {
    const a = manifestFromProfile(
      { inferredName: 'Cool App', design: { primaryColor: null, backgroundColor: null, iconHrefs: [] } },
      fallback,
    );
    expect(a.name).toBe('Cool App');

    const b = manifestFromProfile(
      { inferredName: '', design: { primaryColor: null, backgroundColor: null, iconHrefs: [] } },
      fallback,
    );
    expect(b.name).toBe(fallback.appName);
  });

  test('short_name truncates to first word, max 12 chars', () => {
    const a = manifestFromProfile(
      { inferredName: 'Recipe', design: { primaryColor: null, backgroundColor: null, iconHrefs: [] } },
      fallback,
    );
    expect(a.short_name).toBe('Recipe');

    const b = manifestFromProfile(
      {
        inferredName: 'My Very Long Application Name',
        design: { primaryColor: null, backgroundColor: null, iconHrefs: [] },
      },
      fallback,
    );
    expect(b.short_name).toBe('My');

    const c = manifestFromProfile(
      {
        inferredName: 'Supercalifragilistic',
        design: { primaryColor: null, backgroundColor: null, iconHrefs: [] },
      },
      fallback,
    );
    expect(c.short_name).toBe('Supercalifra');
  });

  test('prefers apple-touch-icon over plain favicon', () => {
    const out = manifestFromProfile(
      {
        inferredName: 'X',
        design: {
          primaryColor: null,
          backgroundColor: null,
          iconHrefs: ['/favicon.ico', '/apple-touch-icon.png', '/icon.png'],
        },
      },
      fallback,
    );
    expect(out.iconHref).toBe('/apple-touch-icon.png');
  });

  test('falls through to first icon when no apple-touch-icon', () => {
    const out = manifestFromProfile(
      {
        inferredName: 'X',
        design: { primaryColor: null, backgroundColor: null, iconHrefs: ['/favicon.ico'] },
      },
      fallback,
    );
    expect(out.iconHref).toBe('/favicon.ico');
  });

  test('returns null iconHref when no icons in bundle', () => {
    const out = manifestFromProfile(
      { inferredName: 'X', design: { primaryColor: null, backgroundColor: null, iconHrefs: [] } },
      fallback,
    );
    expect(out.iconHref).toBeNull();
  });

  test('display is always standalone', () => {
    const out = manifestFromProfile(
      { inferredName: 'X', design: { primaryColor: null, backgroundColor: null, iconHrefs: [] } },
      fallback,
    );
    expect(out.display).toBe('standalone');
  });
});
