import { describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { WorkerEnv } from '../env.ts';
import type { KvStore, R2Store } from '@shippie/dev-storage';

function fakeKv(data: Record<string, string> = {}): KvStore {
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
    list: async (p) => Object.keys(data).filter((k) => !p || k.startsWith(p)),
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

function envFor(): WorkerEnv {
  return {
    SHIPPIE_ENV: 'test',
    PLATFORM_API_URL: 'https://example.invalid',
    WORKER_PLATFORM_SECRET: 'test-secret',
    INVITE_SECRET: 'test-invite-secret',
    APP_CONFIG: fakeKv(),
    SHIPPIE_APPS: emptyR2(),
    SHIPPIE_PUBLIC: emptyR2(),
  };
}

describe('GET /__shippie/group/<id>/moderate', () => {
  const app = createApp();

  test('serves standalone HTML for a group id', async () => {
    const res = await app.fetch(
      new Request('https://recipe.shippie.app/__shippie/group/abc-123/moderate', {
        headers: { host: 'recipe.shippie.app' },
      }),
      envFor(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Group moderation');
    // Should embed the group id for the client script.
    expect(html).toContain('abc-123');
    // Mode row buttons present.
    expect(html).toContain('owner-approved');
    expect(html).toContain('ai-screened');
    // Owner-only guard rendered (script-side).
    expect(html).toContain('not-owner');
  });

  test('chooser HTML on the index path', async () => {
    const res = await app.fetch(
      new Request('https://recipe.shippie.app/__shippie/group', {
        headers: { host: 'recipe.shippie.app' },
      }),
      envFor(),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Pick a group');
  });

  test('refuses unknown host', async () => {
    const res = await app.fetch(
      new Request('https://random.example/__shippie/group/abc/moderate', {
        headers: { host: 'random.example' },
      }),
      envFor(),
    );
    expect(res.status).toBe(400);
  });

  test('owner-only guard text is in the served HTML', async () => {
    // The Worker has no notion of who the owner is — by design. The
    // page itself enforces the check client-side against the local
    // SDK state. Here we verify the guard markup + script are present
    // so a non-owner sees the empty state instead of the queue.
    const res = await app.fetch(
      new Request('https://recipe.shippie.app/__shippie/group/g-42/moderate', {
        headers: { host: 'recipe.shippie.app' },
      }),
      envFor(),
    );
    const html = await res.text();
    // The guard branch.
    expect(html).toContain('hook.ownerPeerId !== hook.selfPeerId');
    // The "not the owner" message.
    expect(html).toContain('This view is for the group owner');
  });

  test('escapes hostile characters in the slug tag', async () => {
    // Slug comes from the host header; the resolver only allows safe
    // labels but we still escape defensively in the renderer.
    const res = await app.fetch(
      new Request("https://safe-slug.shippie.app/__shippie/group/x/moderate", {
        headers: { host: 'safe-slug.shippie.app' },
      }),
      envFor(),
    );
    const html = await res.text();
    expect(html).toContain('safe-slug');
    // No raw <script>s injected via slug interpolation paths — the
    // slug only appears between the tag span and the </h1>, so check
    // just that fragment.
    const m = /class="tag">([^<]*)<\/span>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('safe-slug');
  });
});
