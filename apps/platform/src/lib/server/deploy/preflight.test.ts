import { describe, it, expect } from 'vitest';
import { runPreflight } from './preflight';

const enc = (s: string) => new TextEncoder().encode(s);
const reservedSlugs = new Set(['admin', 'api']);

const baseInput = (overrides: Partial<Parameters<typeof runPreflight>[0]> = {}) => ({
  slug: 'okapp',
  manifest: {
    type: 'app',
    name: 'Okay',
    data: {
      mode: 'shippie-documents' as const,
      documents: ['main'],
      attachments: false,
      recovery: 'inherited' as const,
      migrations: 'snapshot-v0' as const,
      snapshots: 'inherited' as const,
      media: 'none' as const,
      realtime: 'inherited' as const,
      localStorage: { keys: [], prefixes: [] },
    },
  },
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
    expect(r.findings.some((f) => f.rule === 'app-data-standard' && f.severity === 'pass')).toBe(true);
  });

  it('blocks authored app manifests with no explicit data policy', () => {
    const r = runPreflight(
      baseInput({
        manifest: { type: 'app', name: 'No Data Contract' },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.blockers.find((b) => b.rule === 'app-data-standard')?.title).toContain('No app data policy');
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

  it('requires index.html at the deploy root even for website manifests', () => {
    const r = runPreflight(
      baseInput({
        manifest: { type: 'website', name: 'Site' },
        files: new Map([['nested/index.html', enc('<html></html>')]]),
      }),
    );
    expect(r.blockers.some((b) => b.rule === 'entry-file-present')).toBe(true);
    expect(r.blockers.find((b) => b.rule === 'entry-file-present')?.title).toContain('root');
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

  it('blocks Shippie Document apps that disable inherited recovery', () => {
    const r = runPreflight(
      baseInput({
        manifest: {
          type: 'app',
          name: 'Unsafe Data App',
          data: {
            mode: 'shippie-documents',
            documents: ['main'],
            attachments: false,
            recovery: 'none',
            migrations: 'snapshot-v0',
            snapshots: 'inherited',
            media: 'none',
            realtime: 'inherited',
            localStorage: { keys: [], prefixes: [] },
          },
        },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.blockers.some((b) => b.rule === 'app-data-standard')).toBe(true);
  });

  it('allows explicit local-only apps', () => {
    const r = runPreflight(
      baseInput({
        manifest: {
          type: 'app',
          name: 'Local Scratchpad',
          data: {
            mode: 'local-only',
            documents: [],
            attachments: false,
            recovery: 'none',
            migrations: 'none',
            snapshots: 'none',
            media: 'none',
            realtime: 'none',
            localStorage: { keys: [], prefixes: [] },
          },
        },
      }),
    );
    expect(r.passed).toBe(true);
    expect(r.findings.find((f) => f.rule === 'app-data-standard')?.title).toContain('local-only');
  });
});
