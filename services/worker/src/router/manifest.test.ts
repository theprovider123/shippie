// services/worker/src/router/manifest.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string>): KvStore {
  return {
    get: async (k) => data[k] ?? null,
    getJson: async <T>(k: string) => (data[k] ? (JSON.parse(data[k]!) as T) : null),
    put: async (k, v) => {
      data[k] = v;
    },
    putJson: async (k, v) => {
      data[k] = JSON.stringify(v);
    },
    delete: async (k) => {
      delete data[k];
    },
    list: async (prefix) => Object.keys(data).filter((k) => !prefix || k.startsWith(prefix)),
  };
}

function emptyR2(): R2Store {
  return {
    get: async () => null,
    head: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => [],
  };
}

function envFor(kv: KvStore): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://example.invalid',
    WORKER_PLATFORM_SECRET: 'test-secret',
    INVITE_SECRET: 'test-invite-secret',
    APP_CONFIG: kv,
    SHIPPIE_APPS: emptyR2(),
    SHIPPIE_PUBLIC: emptyR2(),
  };
}

describe('__shippie/manifest', () => {
  let kv: KvStore;
  let env: WorkerEnv;
  const app = createApp();

  beforeEach(() => {
    const store: Record<string, string> = {};
    kv = fakeKv(store);
    env = envFor(kv);
  });

  test('minimal metadata produces a valid manifest with Phase 1 defaults', async () => {
    await kv.putJson('apps:zen:meta', { name: 'Zen' });

    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/manifest', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;

    expect(m.name).toBe('Zen');
    expect(m.short_name).toBe('Zen');
    expect(m.id).toBe('/?app=zen');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.display_override).toEqual(['standalone', 'minimal-ui']);
    expect(m.launch_handler).toEqual({ client_mode: ['navigate-existing', 'auto'] });

    const icons = m.icons as Array<Record<string, string>>;
    const purposes = icons.map((i) => i.purpose ?? 'any');
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  test('merges custom pwa fields from apps:{slug}:pwa', async () => {
    await kv.putJson('apps:zen:meta', {
      name: 'Zen Notes',
      theme_color: '#112233',
    });
    await kv.putJson('apps:zen:pwa', {
      id: '/?app=zen-notes',
      categories: ['productivity'],
      screenshots: [
        {
          src: '/screenshots/1.png',
          sizes: '1170x2532',
          type: 'image/png',
          form_factor: 'narrow',
          label: 'Home',
        },
      ],
      share_target: {
        action: '/share',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { title: 'title', text: 'text', url: 'url' },
      },
    });

    const res = await app.fetch(
      new Request('https://zen.shippie.app/__shippie/manifest', {
        headers: { host: 'zen.shippie.app' },
      }),
      env,
    );
    const m = (await res.json()) as Record<string, unknown>;

    expect(m.id).toBe('/?app=zen-notes');
    expect(m.theme_color).toBe('#112233');
    expect(m.categories).toEqual(['productivity']);
    expect((m.screenshots as unknown[]).length).toBe(1);
    expect(m.share_target).toEqual({
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url' },
    });
  });

  test('unknown app still produces a usable manifest', async () => {
    const res = await app.fetch(
      new Request('https://ghost.shippie.app/__shippie/manifest', {
        headers: { host: 'ghost.shippie.app' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;
    expect(m.name).toBe('ghost');
    expect(m.id).toBe('/?app=ghost');
  });
});
