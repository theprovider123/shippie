import { describe, expect, test } from 'bun:test';
import { classifyKind } from './kind-classifier.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function bundle(entries: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(entries)) {
    m.set(path, enc(content));
  }
  return m;
}

describe('classifyKind — Local', () => {
  test('empty bundle classifies as local with zero confidence', () => {
    const result = classifyKind(new Map());
    expect(result.detectedKind).toBe('local');
    expect(result.confidence).toBe(0);
    expect(result.backendProviders).toEqual([]);
    expect(result.externalDomains).toEqual([]);
  });

  test('plain app with no external deps is local', () => {
    const files = bundle({
      'app.js': `function add(a, b) { return a + b; } export { add };`,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.reasons).toContain('no external dependencies detected');
  });

  test('app using indexedDB + service worker is local with signals', () => {
    const files = bundle({
      'main.js': `
        navigator.serviceWorker.register('/sw.js');
        const db = indexedDB.open('mydb', 1);
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.localSignals).toContain('service-worker');
    expect(result.localSignals).toContain('indexeddb');
  });

  test('app using @shippie/sdk is local with shippie-sdk signal', () => {
    const files = bundle({
      'main.ts': `import { wrap } from '@shippie/sdk';`,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.localSignals).toContain('shippie-sdk');
  });
});

describe('classifyKind — Connected', () => {
  test('app fetching external API is connected', () => {
    const files = bundle({
      'api.ts': `
        const ENDPOINT = 'https://world.openfoodfacts.org/api/v0/product';
        export async function lookup(id) {
          return fetch(\`\${ENDPOINT}/\${id}.json\`);
        }
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(result.externalDomains).toContain('world.openfoodfacts.org');
    expect(result.backendProviders).toEqual([]);
  });

  test('shippie-hosted URLs do not trigger connected', () => {
    const files = bundle({
      'main.ts': `
        const PROOF = 'https://shippie.app/__shippie/proof';
        const AI = 'https://ai.shippie.app/manifest.webmanifest';
        const APP = 'https://demo.shippie.app/data';
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.externalDomains).toEqual([]);
  });

  test('multiple external domains are deduped and sorted', () => {
    const files = bundle({
      'app.js': `
        const A = 'https://api.openweathermap.org/data';
        const B = 'https://api.openweathermap.org/forecast';
        const C = 'https://api.coingecko.com/v3/coins';
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(result.externalDomains).toEqual([
      'api.coingecko.com',
      'api.openweathermap.org',
    ]);
  });

  test('test fixtures and reference URLs do not make a local app connected', () => {
    const files = bundle({
      'src/app.ts': `
        const placeholder = 'https://example.com/recipes/lemon-roast-chicken';
        const schemaContext = 'https://schema.org';
      `,
      'src/app.test.ts': `
        const fixture = 'https://api.vendor.test/fixture';
      `,
      'src/__fixtures__/sample.ts': `
        const fixture = 'https://real-fixture-service.invalid/data';
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
    expect(result.externalDomains).toEqual([]);
  });
});

describe('classifyKind — Cloud', () => {
  test('Supabase import is cloud with localization candidate', () => {
    const files = bundle({
      'db.ts': `
        import { createClient } from '@supabase/supabase-js';
        const supabase = createClient(url, key);
        const { data } = await supabase.from('recipes').select('*');
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.backendProviders).toContain('supabase');
    expect(result.localization.candidate).toBe(true);
    expect(result.localization.supportedTransforms).toContain(
      'supabase-basic-queries',
    );
    expect(result.localization.blockers).toEqual([]);
  });

  test('Supabase + RPC is cloud but not a localization candidate', () => {
    const files = bundle({
      'db.ts': `
        import { createClient } from '@supabase/supabase-js';
        const supabase = createClient(url, key);
        await supabase.rpc('do_thing', { id: 1 });
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.localization.candidate).toBe(false);
    expect(result.localization.blockers).toContain('uses-supabase-rpc');
  });

  test('Supabase realtime channel adds blocker', () => {
    const files = bundle({
      'live.ts': `
        import { createClient } from '@supabase/supabase-js';
        const c = createClient(u, k);
        c.channel('room').subscribe();
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.localization.blockers).toContain('uses-supabase-realtime');
  });

  test('next-auth import is cloud with auth transform', () => {
    const files = bundle({
      'auth.ts': `import { NextAuth } from 'next-auth';`,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.backendProviders).toContain('next-auth');
    expect(result.localization.supportedTransforms).toContain(
      'authjs-to-local-identity',
    );
  });

  test('SvelteKit server endpoint is cloud', () => {
    const files = bundle({
      '+server.ts': `
        export const GET = async ({ request }) => {
          return new Response('hi');
        };
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.backendProviders).toContain(
      'sveltekit-or-nextjs-server-route',
    );
  });

  test('RSC server action is cloud', () => {
    const files = bundle({
      'action.ts': `
        'use server';
        export async function createPost(data) { /* ... */ }
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
    expect(result.backendProviders).toContain('rsc-server-action');
  });

  test('cloud + external domain still classifies as cloud', () => {
    // Provider markers take precedence over external-fetch markers.
    const files = bundle({
      'mixed.ts': `
        import { createClient } from '@supabase/supabase-js';
        const url = 'https://api.openweathermap.org/x';
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('cloud');
  });
});

describe('classifyKind — Shippie-mediated connectivity', () => {
  test('@shippie/proximity import is connected', () => {
    const files = bundle({
      'app.tsx': `
        import { createGroup, joinGroup } from '@shippie/proximity';
        const g = await createGroup({ appSlug: 'whiteboard' });
      `,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(
      result.reasons.some((r) => r.startsWith('multi-peer via Shippie')),
    ).toBe(true);
  });

  test('@shippie/sdk alone (no proximity) stays local', () => {
    const files = bundle({
      'app.ts': `import { wrap } from '@shippie/sdk';`,
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('local');
  });

  test('shippie.json spaces declaration is connected even without imports', () => {
    const files = bundle({
      'main.ts': `console.log('plain app');`,
      'shippie.json': JSON.stringify({
        spaces: {
          enabled: true,
          roles: [{ id: 'member', permissions: ['read', 'write'] }],
          syncMode: 'sealed-cloud',
          archivable: true,
        },
      }),
    });
    const result = classifyKind(files);
    expect(result.detectedKind).toBe('connected');
    expect(
      result.reasons.some((reason) => reason.includes('shippie-spaces-sealed-cloud')),
    ).toBe(true);
  });
});

describe('classifyKind — confidence', () => {
  test('confidence reflects scannable coverage', () => {
    const files = bundle({
      'app.js': `console.log('hello');`,
      'data.bin': ' ',
    });
    const result = classifyKind(files);
    // app.js is scannable, data.bin is not, so coverage < 1
    expect(result.confidence).toBeLessThan(0.95);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  test('all-scannable bundle hits the 0.95 ceiling', () => {
    const files = bundle({
      'a.js': `console.log('a');`,
      'b.ts': `console.log('b');`,
    });
    const result = classifyKind(files);
    expect(result.confidence).toBe(0.95);
  });
});
