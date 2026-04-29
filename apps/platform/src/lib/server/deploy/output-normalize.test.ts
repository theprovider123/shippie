import { describe, expect, test } from 'vitest';
import { normalizeDeployOutput } from './output-normalize';

const enc = (s: string) => new TextEncoder().encode(s);

describe('normalizeDeployOutput', () => {
  test('leaves root index.html deploys unchanged', () => {
    const files = new Map([
      ['index.html', enc('<html></html>')],
      ['assets/app.js', enc('console.log(1)')],
    ]);

    const out = normalizeDeployOutput(files);

    expect(out.changed).toBe(false);
    expect(out.root).toBe('');
    expect(out.indexPath).toBe('index.html');
    expect(out.files).toEqual(files);
  });

  test('publishes dist/ as root and drops source files outside output', () => {
    const files = new Map([
      ['package.json', enc('{}')],
      ['src/App.tsx', enc('source')],
      ['dist/index.html', enc('<html></html>')],
      ['dist/assets/app.js', enc('console.log(1)')],
    ]);

    const out = normalizeDeployOutput(files);

    expect(out.changed).toBe(true);
    expect(out.root).toBe('dist');
    expect(out.indexPath).toBe('dist/index.html');
    expect(out.framework).toBe('vite-static');
    expect([...out.files.keys()].sort()).toEqual(['assets/app.js', 'index.html']);
    expect(out.totalBytes).toBe(enc('<html></html>').byteLength + enc('console.log(1)').byteLength);
  });

  test('detects Next static export from out/_next', () => {
    const out = normalizeDeployOutput(
      new Map([
        ['out/index.html', enc('<html></html>')],
        ['out/_next/static/chunk.js', enc('console.log(1)')],
      ]),
    );

    expect(out.root).toBe('out');
    expect(out.framework).toBe('next-static');
    expect(out.files.has('_next/static/chunk.js')).toBe(true);
  });

  test('detects SvelteKit static output from build/_app', () => {
    const out = normalizeDeployOutput(
      new Map([
        ['build/index.html', enc('<html></html>')],
        ['build/_app/immutable/start.js', enc('console.log(1)')],
      ]),
    );

    expect(out.root).toBe('build');
    expect(out.framework).toBe('sveltekit-static');
    expect(out.files.has('_app/immutable/start.js')).toBe(true);
  });

  test('returns unknown without mutating when no index exists', () => {
    const files = new Map([['main.js', enc('console.log(1)')]]);
    const out = normalizeDeployOutput(files);

    expect(out.changed).toBe(false);
    expect(out.framework).toBe('unknown');
    expect(out.indexPath).toBeNull();
    expect(out.files).toEqual(files);
  });
});
