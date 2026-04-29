/**
 * A4 — AppProfile zero-config verification.
 *
 * These tests pin the zero-config flow: a deployed SPA bundle with NO
 * `shippie.json` rules must still produce a useful AppProfile that
 * classifies the category and recommends sensible enhancements.
 *
 * Without the meta-description + manifest-scanner gap-fixes, an SPA dist
 * file (`<div id="root"></div>` body) would only contribute its `<title>`
 * to visibleText — too thin for the semantic classifier on most apps.
 */
import { describe, expect, test } from 'bun:test';
import { analyseApp } from './index.ts';
import { scanHtml } from './html-scanner.ts';
import { scanManifest } from './manifest-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('html-scanner — meta description signal', () => {
  test('captures meta description into visibleText', () => {
    const files = new Map([
      [
        'index.html',
        enc(`<!doctype html><html><head>
          <title>Untitled App</title>
          <meta name="description" content="Track your daily workout sets and reps.">
        </head><body><div id="root"></div></body></html>`),
      ],
    ]);
    const r = scanHtml(files);
    expect(r.visibleText).toContain('Track your daily workout');
  });

  test('captures og:title and og:description', () => {
    const files = new Map([
      [
        'index.html',
        enc(`<!doctype html><html><head>
          <meta property="og:title" content="Recipe vault">
          <meta property="og:description" content="Save recipes and ingredients.">
        </head><body></body></html>`),
      ],
    ]);
    const r = scanHtml(files);
    expect(r.visibleText).toContain('Recipe vault');
    expect(r.visibleText).toContain('Save recipes and ingredients');
  });

  test('ignores meta tags whose name is not text-bearing', () => {
    const files = new Map([
      [
        'index.html',
        enc(`<meta name="theme-color" content="#FF0000">
              <meta name="viewport" content="width=device-width">`),
      ],
    ]);
    const r = scanHtml(files);
    expect(r.visibleText).not.toContain('#FF0000');
    expect(r.visibleText).not.toContain('width=device-width');
  });
});

describe('manifest-scanner', () => {
  test('extracts name + description from manifest.webmanifest', () => {
    const files = new Map([
      [
        'manifest.webmanifest',
        enc(JSON.stringify({
          name: 'Workout Logger',
          short_name: 'Logs',
          description: 'Log strength training sets and cardio sessions.',
        })),
      ],
    ]);
    const r = scanManifest(files);
    expect(r.text).toContain('Workout Logger');
    expect(r.text).toContain('strength training');
  });

  test('falls back to manifest.json', () => {
    const files = new Map([
      [
        'manifest.json',
        enc(JSON.stringify({ name: 'Recipe Box' })),
      ],
    ]);
    const r = scanManifest(files);
    expect(r.text).toBe('Recipe Box');
  });

  test('returns empty text when no manifest present', () => {
    const r = scanManifest(new Map());
    expect(r.text).toBe('');
  });

  test('ignores malformed JSON without throwing', () => {
    const files = new Map([
      ['manifest.webmanifest', enc('not json')],
    ]);
    const r = scanManifest(files);
    expect(r.text).toBe('');
  });
});

describe('analyseApp — zero-config SPA smoke test', () => {
  test('SPA dist with no shippie.json still classifies category from manifest+meta', async () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'index.html',
      enc(`<!doctype html><html><head>
        <title>App</title>
        <meta name="description" content="Plan meals and track ingredients for tonight's dinner.">
        <link rel="manifest" href="/manifest.webmanifest">
      </head><body>
        <div id="root"></div>
        <script type="module" src="/assets/index.js"></script>
      </body></html>`),
    );
    files.set(
      'manifest.webmanifest',
      enc(JSON.stringify({
        name: 'Meal Planner',
        short_name: 'Meals',
        description: 'A weekly meal planner with shopping list, oven timers, and recipe imports.',
      })),
    );
    files.set('assets/index.js', enc(`import {h} from 'preact';`));

    const profile = await analyseApp({ files });

    expect(profile.category.primary).toBe('cooking');
    expect(profile.recommended.enhance['canvas, [data-shippie-canvas], main']).toEqual(['wakelock']);
    expect(profile.recommended.ambient.wakeLock).toBe('auto');
    expect(profile.recommended.enhance['button, [role="button"], input[type="submit"]']).toEqual(['textures']);
  });

  test('journal SPA without shippie.json gets ai pipeline recommendation', async () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'index.html',
      enc(`<!doctype html><html><head>
        <title>App</title>
        <meta name="description" content="A quiet journal for your daily reflection and gratitude entries.">
      </head><body><div id="root"></div></body></html>`),
    );
    files.set(
      'manifest.json',
      enc(JSON.stringify({
        name: 'Daily Journal',
        description: 'Capture today\'s mood, feelings, and what you noticed.',
      })),
    );

    const profile = await analyseApp({ files });

    expect(profile.category.primary).toBe('journal');
    expect(profile.recommended.ai).toEqual(['classify', 'embed', 'sentiment']);
  });

  test('replicates the showcase-recipe dist bundle without shippie.json overrides', async () => {
    // Mirrors apps/showcase-recipe/dist/index.html + public/manifest.webmanifest
    // so we can reason about the zero-config path the production wrapper sees.
    const files = new Map<string, Uint8Array>();
    files.set(
      'index.html',
      enc(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#E8603C" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.png" type="image/png" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <title>Recipe Saver — Shippie</title>
    <meta name="description" content="A local-first recipe saver. Your recipes, your device. Powered by Shippie." />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`),
    );
    files.set(
      'manifest.webmanifest',
      enc(JSON.stringify({
        name: 'Recipe Saver',
        short_name: 'Recipes',
        description: 'A local-first recipe saver. Your recipes never leave your device.',
      })),
    );
    const profile = await analyseApp({ files });
    expect(profile.inferredName).toBe('Recipe Saver — Shippie');
    expect(profile.category.primary).toBe('cooking');
    expect(profile.design.iconHrefs).toContain('/icon.png');
    expect(profile.recommended.ambient.wakeLock).toBe('auto');
  });

  test('without manifest+meta a generic-titled SPA stays unknown — confirming the gap-fix is load-bearing', async () => {
    const files = new Map<string, Uint8Array>();
    files.set(
      'index.html',
      enc(`<!doctype html><html><head><title>App</title></head>
        <body><div id="root"></div></body></html>`),
    );
    const profile = await analyseApp({ files });
    expect(profile.category.primary).toBe('unknown');
  });
});
