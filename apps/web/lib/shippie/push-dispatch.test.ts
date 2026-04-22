import { describe, expect, test } from 'bun:test';
import { dispatchPush } from './push-dispatch.ts';

describe('dispatchPush (Phase 2 stub)', () => {
  test('returns ok=false with reason=not_implemented', async () => {
    const result = await dispatchPush(
      {
        endpoint: 'https://push.example.com/sub/abc',
        keys: { p256dh: 'k', auth: 'a' },
      },
      {
        title: 'Hello',
        body: 'World',
        url: 'https://shippie.app/apps/zen',
      },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_implemented');
  });
});
