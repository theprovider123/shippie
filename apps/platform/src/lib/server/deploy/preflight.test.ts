import { describe, it, expect } from 'vitest';
import { runPreflight } from './preflight';

const enc = (s: string) => new TextEncoder().encode(s);
const reservedSlugs = new Set(['admin', 'api']);

const baseInput = (overrides: Partial<Parameters<typeof runPreflight>[0]> = {}) => ({
  slug: 'okapp',
  manifest: { type: 'app', name: 'Okay' },
  files: new Map([['index.html', enc('<html></html>')]]),
  totalBytes: 12,
  reservedSlugs,
  ...overrides,
});

describe('runPreflight', () => {
  it('passes a valid app', () => {
    const r = runPreflight(baseInput());
    expect(r.passed).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks reserved slugs', () => {
    const r = runPreflight(baseInput({ slug: 'admin' }));
    expect(r.passed).toBe(false);
    expect(r.blockers.some((b) => b.rule === 'slug-validation')).toBe(true);
  });

  it('blocks invalid slug format', () => {
    const r = runPreflight(baseInput({ slug: 'BAD!' }));
    expect(r.passed).toBe(false);
    expect(r.blockers.some((b) => b.rule === 'slug-validation')).toBe(true);
  });

  it('blocks __shippie/* collisions', () => {
    const r = runPreflight(
      baseInput({ files: new Map([['__shippie/sdk.js', enc('x')], ['index.html', enc('<html></html>')]]) }),
    );
    expect(r.blockers.some((b) => b.rule === 'reserved-paths-collision')).toBe(true);
  });

  it('blocks root sw.js conflicts', () => {
    const r = runPreflight(
      baseInput({ files: new Map([['sw.js', enc('x')], ['index.html', enc('<html></html>')]]) }),
    );
    expect(r.blockers.some((b) => b.rule === 'service-worker-ownership')).toBe(true);
  });

  it('blocks deploys with no index.html for type=app', () => {
    const r = runPreflight(baseInput({ files: new Map([['main.js', enc('x')]]) }));
    expect(r.blockers.some((b) => b.rule === 'entry-file-present')).toBe(true);
  });

  it('detects server-side code', () => {
    const r = runPreflight(
      baseInput({
        files: new Map([
          ['index.html', enc('<html></html>')],
          ['app/api/route.ts', enc('export async function GET() {}')],
        ]),
      }),
    );
    expect(r.blockers.some((b) => b.rule === 'server-code')).toBe(true);
  });

  it('warns on large output', () => {
    const r = runPreflight(baseInput({ totalBytes: 150 * 1024 * 1024 }));
    expect(r.passed).toBe(true);
    expect(r.warnings.some((w) => w.rule === 'output-size')).toBe(true);
  });

  it('blocks on huge output', () => {
    const r = runPreflight(baseInput({ totalBytes: 250 * 1024 * 1024 }));
    expect(r.passed).toBe(false);
    expect(r.blockers.some((b) => b.rule === 'output-size')).toBe(true);
  });
});
