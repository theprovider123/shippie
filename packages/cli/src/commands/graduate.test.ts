import { describe, expect, test } from 'bun:test';
import { graduateScaffold } from './graduate.ts';

describe('graduateScaffold', () => {
  test('rejects invalid slugs before explaining retirement', () => {
    expect(() => graduateScaffold({ slug: 'BAD SLUG' })).toThrow(/Invalid slug/);
    expect(() => graduateScaffold({ slug: '-leading' })).toThrow(/Invalid slug/);
    expect(() => graduateScaffold({ slug: '' })).toThrow(/Invalid slug/);
  });

  test('is retired from the launch maker path', () => {
    expect(() => graduateScaffold({ slug: 'recipe-saver' })).toThrow(/graduate retired/);
    expect(() => graduateScaffold({ slug: 'recipe-saver' })).toThrow(/PWA-first/);
    expect(() => graduateScaffold({ slug: 'recipe-saver' })).toThrow(/shippie deploy \.\/dist/);
  });
});
