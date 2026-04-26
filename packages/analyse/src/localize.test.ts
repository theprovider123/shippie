import { describe, expect, test } from 'bun:test';
import { localize } from './localize.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function bundle(entries: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(entries)) m.set(k, enc(v));
  return m;
}

describe('localize — supabase-basic-queries', () => {
  test('rewrites @supabase import + createClient', () => {
    const files = bundle({
      'src/lib/db.ts': `
        import { createClient } from '@supabase/supabase-js';
        const supabase = createClient(url, key);
        export const recipes = await supabase.from('recipes').select('*');
      `,
    });
    const [patch] = localize({ files, transforms: ['supabase-basic-queries'] });
    expect(patch!.transform).toBe('supabase-basic-queries');
    expect(patch!.fileChanges).toHaveLength(1);
    const change = patch!.fileChanges[0]!;
    expect(change.after).toContain("from '$lib/shippie-local/supabase-shim'");
    expect(change.after).toContain('createLocalSupabaseClient()');
    expect(change.after).not.toContain('@supabase/supabase-js');
    expect(patch!.newFiles).toHaveLength(1);
    expect(patch!.newFiles[0]!.path).toBe('src/lib/shippie-local/supabase-shim.ts');
  });

  test('warns on .rpc() usage', () => {
    const files = bundle({
      'rpc.ts': `
        import { createClient } from '@supabase/supabase-js';
        const supabase = createClient(u, k);
        await supabase.rpc('do_thing', {});
      `,
    });
    const [patch] = localize({ files, transforms: ['supabase-basic-queries'] });
    expect(patch!.warnings.some((w) => w.includes('.rpc()'))).toBe(true);
  });

  test('warns on .channel() usage', () => {
    const files = bundle({
      'live.ts': `
        import { createClient } from '@supabase/supabase-js';
        const c = createClient(u, k);
        c.channel('room').subscribe();
      `,
    });
    const [patch] = localize({ files, transforms: ['supabase-basic-queries'] });
    expect(patch!.warnings.some((w) => w.includes('.channel()'))).toBe(true);
  });

  test('skips files that don\'t import Supabase', () => {
    const files = bundle({ 'unrelated.ts': `console.log('hi');` });
    const [patch] = localize({ files, transforms: ['supabase-basic-queries'] });
    expect(patch!.fileChanges).toHaveLength(0);
    expect(patch!.newFiles).toHaveLength(0);
  });
});

describe('localize — authjs-to-local-identity', () => {
  test('rewrites next-auth import + getServerSession call', () => {
    const files = bundle({
      'app.ts': `
        import { getServerSession } from 'next-auth';
        const session = await getServerSession();
      `,
    });
    const [patch] = localize({ files, transforms: ['authjs-to-local-identity'] });
    expect(patch!.transform).toBe('authjs-to-local-identity');
    expect(patch!.fileChanges).toHaveLength(1);
    const change = patch!.fileChanges[0]!;
    expect(change.after).toContain('getLocalIdentitySession');
    expect(change.after).not.toContain('next-auth');
    expect(patch!.newFiles[0]!.path).toBe('src/lib/shippie-local/local-identity.ts');
  });

  test('warns on signIn() call sites', () => {
    const files = bundle({
      'login.ts': `
        import { signIn } from 'next-auth/react';
        signIn('google');
      `,
    });
    const [patch] = localize({ files, transforms: ['authjs-to-local-identity'] });
    expect(patch!.warnings.some((w) => w.includes('signIn()'))).toBe(true);
  });

  test('handles @auth/* imports', () => {
    const files = bundle({
      'srv.ts': `
        import { Auth } from '@auth/core';
        const handler = Auth({});
      `,
    });
    const [patch] = localize({ files, transforms: ['authjs-to-local-identity'] });
    expect(patch!.fileChanges).toHaveLength(1);
    expect(patch!.fileChanges[0]!.after).toContain('getLocalIdentitySession');
  });
});

describe('localize — supabase-storage-to-local-files', () => {
  test('rewrites .storage.from().upload()', () => {
    const files = bundle({
      'photos.ts': `
        const file = new Blob();
        await supabase.storage.from('photos').upload('meal.jpg', file);
      `,
    });
    const [patch] = localize({
      files,
      transforms: ['supabase-storage-to-local-files'],
    });
    expect(patch!.fileChanges).toHaveLength(1);
    expect(patch!.fileChanges[0]!.after).toContain("writeLocalFile('photos/meal.jpg'");
    expect(patch!.newFiles[0]!.path).toBe('src/lib/shippie-local/local-files.ts');
  });

  test('rewrites .getPublicUrl()', () => {
    const files = bundle({
      'view.ts': `
        const url = supabase.storage.from('photos').getPublicUrl('meal.jpg');
      `,
    });
    const [patch] = localize({
      files,
      transforms: ['supabase-storage-to-local-files'],
    });
    expect(patch!.fileChanges).toHaveLength(1);
    expect(patch!.fileChanges[0]!.after).toContain("localFileUrl('photos/meal.jpg')");
  });
});

describe('localize — chained transforms', () => {
  test('applies multiple transforms returning one patch each', () => {
    const files = bundle({
      'mixed.ts': `
        import { createClient } from '@supabase/supabase-js';
        import { getServerSession } from 'next-auth';
        const c = createClient(u, k);
        const s = await getServerSession();
      `,
    });
    const patches = localize({
      files,
      transforms: ['supabase-basic-queries', 'authjs-to-local-identity'],
    });
    expect(patches).toHaveLength(2);
    expect(patches[0]!.transform).toBe('supabase-basic-queries');
    expect(patches[1]!.transform).toBe('authjs-to-local-identity');
  });
});
