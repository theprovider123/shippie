import { describe, expect, test } from 'vitest';
import { load } from './+page.server';

describe('/apps/[slug] bundled fallback', () => {
  test('serves public first-party app details without a DB binding', async () => {
    const result = (await load(eventFor('palate') as never)) as { app: { slug: string; visibility: string } };

    expect(result.app.slug).toBe('palate');
    expect(result.app.visibility).toBe('public');
  });

  test('does not expose private first-party apps when the DB gate is unavailable', async () => {
    await expect(load(eventFor('mevrouw') as never)).rejects.toMatchObject({ status: 503 });
  });
});

function eventFor(slug: string) {
  return {
    platform: undefined,
    params: { slug },
    cookies: { get: () => undefined },
    locals: {},
    url: new URL(`https://shippie.test/apps/${slug}`),
  };
}
