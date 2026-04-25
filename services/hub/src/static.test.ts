import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isSafeSlug,
  extractSlugFromHost,
  resolveAppFile,
  serveAppFile,
  mimeFor,
} from './static.ts';

function tmpRoot(label: string): string {
  const root = join(tmpdir(), `shippie-hub-test-${label}-${Date.now()}-${Math.random()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

describe('static helpers', () => {
  test('isSafeSlug rejects shenanigans', () => {
    expect(isSafeSlug('recipe')).toBe(true);
    expect(isSafeSlug('recipe-saver')).toBe(true);
    expect(isSafeSlug('-recipe')).toBe(false);
    expect(isSafeSlug('recipe/../etc')).toBe(false);
    expect(isSafeSlug('recipe.')).toBe(false);
    expect(isSafeSlug('Recipe')).toBe(false);
  });

  test('extractSlugFromHost parses <slug>.hub.local', () => {
    expect(extractSlugFromHost('recipe.hub.local')).toBe('recipe');
    expect(extractSlugFromHost('recipe.hub.local:80')).toBe('recipe');
    expect(extractSlugFromHost('hub.local')).toBeNull();
    expect(extractSlugFromHost('recipe.example.com')).toBeNull();
  });

  test('mimeFor maps known extensions', () => {
    expect(mimeFor('a/b.html')).toContain('text/html');
    expect(mimeFor('x.js')).toContain('javascript');
    expect(mimeFor('x.png')).toBe('image/png');
    expect(mimeFor('x.unknown')).toBe('application/octet-stream');
  });
});

describe('resolveAppFile + serveAppFile', () => {
  test('resolveAppFile returns latest version asset; refuses dot-dot', async () => {
    const root = tmpRoot('resolve');
    try {
      mkdirSync(join(root, 'apps', 'recipe', '2025-01-01'), { recursive: true });
      mkdirSync(join(root, 'apps', 'recipe', '2025-02-01'), { recursive: true });
      writeFileSync(join(root, 'apps', 'recipe', '2025-02-01', 'index.html'), '<h1>v2</h1>');

      const path = await resolveAppFile(root, 'recipe', 'index.html');
      expect(path).not.toBeNull();
      expect(path!.endsWith('index.html')).toBe(true);
      expect(path).toContain('2025-02-01');

      const escape = await resolveAppFile(root, 'recipe', '../../etc/passwd');
      expect(escape).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serveAppFile responds with file bytes and correct mime', async () => {
    const root = tmpRoot('serve');
    try {
      mkdirSync(join(root, 'apps', 'whiteboard', 'v1'), { recursive: true });
      writeFileSync(join(root, 'apps', 'whiteboard', 'v1', 'index.html'), '<!doctype html>x');

      const res = await serveAppFile(root, 'whiteboard', 'index.html');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(await res.text()).toContain('<!doctype html>');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serveAppFile returns helpful 404 for an uncached slug', async () => {
    const root = tmpRoot('miss');
    try {
      const res = await serveAppFile(root, 'nope', 'index.html');
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('not cached');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
