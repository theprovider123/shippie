import { describe, expect, test } from 'bun:test';
import { extractRemixSpec } from './remix-spec.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function bundle(entries: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(entries)) m.set(k, enc(v));
  return m;
}

describe('extractRemixSpec — routes', () => {
  test('extracts Next.js app-router pages', () => {
    const files = bundle({
      'app/page.tsx': '<div />',
      'app/recipes/page.tsx': '<div />',
      'app/recipes/[id]/page.tsx': '<div />',
    });
    const spec = extractRemixSpec({ files });
    const routePaths = spec.routes.map((r) => r.path).sort();
    expect(routePaths).toEqual(['/', '/recipes', '/recipes/[id]']);
    expect(spec.detectedStack).toContain('next');
  });

  test('extracts SvelteKit routes', () => {
    const files = bundle({
      'src/routes/+page.svelte': '<div />',
      'src/routes/about/+page.svelte': '<div />',
    });
    const spec = extractRemixSpec({ files });
    const routePaths = spec.routes.map((r) => r.path).sort();
    expect(routePaths).toEqual(['/', '/about']);
    expect(spec.detectedStack).toContain('sveltekit');
  });

  test('flags SvelteKit server routes as open question', () => {
    const files = bundle({
      'src/routes/api/+server.ts': 'export const GET = () => new Response();',
    });
    const spec = extractRemixSpec({ files });
    expect(spec.openQuestions.some((q) => q.includes('server route'))).toBe(true);
  });
});

describe('extractRemixSpec — schema', () => {
  test('captures Supabase tables', () => {
    const files = bundle({
      'src/db.ts': `
        import { createClient } from '@supabase/supabase-js';
        const c = createClient(u, k);
        c.from('recipes').select('*');
        c.from('categories').select('*');
      `,
    });
    const spec = extractRemixSpec({ files });
    const tables = spec.schema.filter((s) => s.provider === 'supabase').map((s) => s.name).sort();
    expect(tables).toEqual(['categories', 'recipes']);
  });

  test('captures Firestore collections', () => {
    const files = bundle({
      'src/db.ts': `
        import { collection, getDocs } from 'firebase/firestore';
        getDocs(collection(db, 'meals'));
      `,
    });
    const spec = extractRemixSpec({ files });
    expect(spec.schema.find((s) => s.provider === 'firebase' && s.name === 'meals')).toBeDefined();
  });

  test('captures IndexedDB object stores', () => {
    const files = bundle({
      'src/local.ts': `
        const r = indexedDB.open('mydb', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('notes', { keyPath: 'id' });
        };
      `,
    });
    const spec = extractRemixSpec({ files });
    expect(spec.schema.find((s) => s.provider === 'indexeddb' && s.name === 'notes')).toBeDefined();
  });
});

describe('extractRemixSpec — forms + APIs + intent', () => {
  test('captures form input names', () => {
    const files = bundle({
      'src/Form.tsx': `
        export function F() {
          return <form><input name="title" /><input name="author" /></form>;
        }
      `,
    });
    const spec = extractRemixSpec({ files });
    expect(spec.forms).toHaveLength(1);
    expect(spec.forms[0]!.inputs).toEqual(['author', 'title']);
  });

  test('captures external API hosts and skips Shippie hosts', () => {
    const files = bundle({
      'src/api.ts': `
        const A = 'https://api.openweathermap.org/x';
        const SHIPPIE = 'https://shippie.app/__shippie/proof';
      `,
    });
    const spec = extractRemixSpec({ files });
    const hosts = spec.externalApis.map((a) => a.host);
    expect(hosts).toContain('api.openweathermap.org');
    expect(hosts).not.toContain('shippie.app');
  });

  test('honors maker intent override', () => {
    const spec = extractRemixSpec({ files: new Map(), makerIntent: 'A recipe tracker.' });
    expect(spec.intentSummary).toBe('A recipe tracker.');
  });

  test('flags missing routes/schema as open questions', () => {
    const spec = extractRemixSpec({ files: new Map() });
    expect(spec.openQuestions.some((q) => q.includes('No schema'))).toBe(true);
    expect(spec.openQuestions.some((q) => q.includes('No routes'))).toBe(true);
  });
});
