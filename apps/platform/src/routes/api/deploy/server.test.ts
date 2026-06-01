import { describe, expect, test, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => ({
  resolveRequestUserId: vi.fn(async () => ({ userId: 'user-1' })),
}));

vi.mock('$server/auth/resolve-user', () => ({
  resolveRequestUserId: mocks.resolveRequestUserId,
}));

vi.mock('$server/wrapper/rate-limit', () => ({
  checkRateLimit: () => ({ ok: true, retryAfterMs: 0 }),
}));

function eventFor(form: FormData) {
  return {
    request: new Request('https://shippie.app/api/deploy', {
      method: 'POST',
      body: form,
    }),
    platform: {
      env: {
        DB: {},
        APPS: {},
        CACHE: {},
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/deploy', () => {
  test('rejects self-remix before deploy side effects', async () => {
    const form = new FormData();
    form.set('slug', 'recipe-saver');
    form.set('remix_from', 'recipe-saver');
    form.set('zip', new File(['zip'], 'app.zip', { type: 'application/zip' }));

    const response = await POST(eventFor(form));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'self_remix_not_allowed',
    });
  });
});
