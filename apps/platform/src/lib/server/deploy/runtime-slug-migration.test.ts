import { describe, expect, it } from 'vitest';
import {
  migrateRuntimeSlug,
  getRuntimeSlugMigrationState,
  resumeRuntimeSlugMigration,
} from './runtime-slug-migration';

class FakeKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, String(value));
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class FakeR2 {
  store = new Map<string, { body: unknown }>();
  async list({ prefix }: { prefix: string; cursor?: string }) {
    const objects = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects, truncated: false, cursor: undefined };
  }
  async get(key: string) {
    const o = this.store.get(key);
    return o ? { body: o.body, httpMetadata: undefined, customMetadata: undefined } : null;
  }
  async put(key: string, body: unknown) {
    this.store.set(key, { body });
  }
}

// db with no custom domains
const noDomainsDb = {
  select() {
    return {
      from() {
        return this;
      },
      where() {
        return Promise.resolve([]);
      },
    };
  },
} as never;

function seedOldSlug(kv: FakeKV, r2: FakeR2) {
  kv.store.set('apps:old:active', 'v1');
  kv.store.set('apps:old:csp', "default-src 'self'");
  kv.store.set('apps:old:meta', JSON.stringify({ slug: 'old', name: 'Old', version: 1 }));
  r2.store.set('apps/old/index.html', { body: '<html></html>' });
  r2.store.set('apps/old/assets/app.js', { body: 'console.log(1)' });
}

describe('migrateRuntimeSlug', () => {
  it('copies KV + R2 to the new slug, verifies, then deletes old KV (R2 retained)', async () => {
    const kv = new FakeKV();
    const r2 = new FakeR2();
    seedOldSlug(kv, r2);

    const result = await migrateRuntimeSlug({
      kv: kv as never,
      r2: r2 as never,
      db: noDomainsDb,
      appId: 'a1',
      from: 'old',
      to: 'new',
      name: 'New Name',
    });

    expect(result.stage).toBe('complete');
    // new KV present
    expect(kv.store.get('apps:new:active')).toBe('v1');
    expect(kv.store.get('apps:new:csp')).toBe("default-src 'self'");
    // meta rewritten with new slug + name
    expect(JSON.parse(kv.store.get('apps:new:meta') as string)).toMatchObject({
      slug: 'new',
      name: 'New Name',
      version: 1,
    });
    // old KV deleted only after verify
    expect(kv.store.get('apps:old:active')).toBeUndefined();
    expect(kv.store.get('apps:old:meta')).toBeUndefined();
    // R2 copied AND old prefix retained for the alias period
    expect(r2.store.has('apps/new/index.html')).toBe(true);
    expect(r2.store.has('apps/new/assets/app.js')).toBe(true);
    expect(r2.store.has('apps/old/index.html')).toBe(true);
    // success clears the state record
    expect(await getRuntimeSlugMigrationState(kv as never, 'a1')).toBeNull();
  });

  it('is idempotent — re-running a completed migration still ends complete', async () => {
    const kv = new FakeKV();
    const r2 = new FakeR2();
    seedOldSlug(kv, r2);
    const opts = {
      kv: kv as never,
      r2: r2 as never,
      db: noDomainsDb,
      appId: 'a1',
      from: 'old',
      to: 'new',
      name: 'New Name',
    };
    await migrateRuntimeSlug(opts);
    const second = await migrateRuntimeSlug(opts);
    expect(second.stage).toBe('complete');
    expect(kv.store.get('apps:new:active')).toBe('v1');
  });

  it('does NOT delete old KV when verification fails (safe to retry)', async () => {
    const r2 = new FakeR2();
    // KV that silently drops writes to apps:new:active → verify fails.
    class DropActiveKV extends FakeKV {
      async put(key: string, value: string) {
        if (key === 'apps:new:active') return; // simulate lost write
        return super.put(key, value);
      }
    }
    const kv = new DropActiveKV();
    seedOldSlug(kv, r2);

    const result = await migrateRuntimeSlug({
      kv: kv as never,
      r2: r2 as never,
      db: noDomainsDb,
      appId: 'a1',
      from: 'old',
      to: 'new',
      name: 'New Name',
    });

    expect(result.stage).toBe('failed');
    // old slug intact — fully functional, nothing lost
    expect(kv.store.get('apps:old:active')).toBe('v1');
    expect(kv.store.get('apps:old:meta')).toBeTruthy();
    // state persisted for resume
    const state = await getRuntimeSlugMigrationState(kv as never, 'a1');
    expect(state?.stage).toBe('failed');
  });

  it('resume completes a migration once the transient fault clears', async () => {
    const r2 = new FakeR2();
    let dropActive = true;
    class FlakyKV extends FakeKV {
      async put(key: string, value: string) {
        if (key === 'apps:new:active' && dropActive) return;
        return super.put(key, value);
      }
    }
    const kv = new FlakyKV();
    seedOldSlug(kv, r2);
    const deps = { kv: kv as never, r2: r2 as never, db: noDomainsDb, appId: 'a1' };

    const first = await migrateRuntimeSlug({ ...deps, from: 'old', to: 'new', name: 'New' });
    expect(first.stage).toBe('failed');

    dropActive = false; // fault clears
    const resumed = await resumeRuntimeSlugMigration(deps);
    expect(resumed?.stage).toBe('complete');
    expect(kv.store.get('apps:new:active')).toBe('v1');
    expect(kv.store.get('apps:old:active')).toBeUndefined();
  });
});
