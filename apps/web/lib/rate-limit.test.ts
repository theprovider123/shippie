import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, rateLimited, resetRateLimits, withRateLimit } from './rate-limit';

beforeEach(() => resetRateLimits());

test('allows first request', () => {
  const r = checkRateLimit({ key: 'a', limit: 5, windowMs: 60_000 });
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 4);
});

test('drains all tokens then rejects', () => {
  for (let i = 0; i < 5; i++) {
    const r = checkRateLimit({ key: 'b', limit: 5, windowMs: 60_000 });
    assert.equal(r.ok, true);
  }
  const r = checkRateLimit({ key: 'b', limit: 5, windowMs: 60_000 });
  assert.equal(r.ok, false);
  assert.ok(r.retryAfterMs > 0);
});

test('tokens refill over time', () => {
  const now = Date.now;
  let time = 1000000;
  Date.now = () => time;

  for (let i = 0; i < 10; i++) checkRateLimit({ key: 'c', limit: 10, windowMs: 10_000 });
  assert.equal(checkRateLimit({ key: 'c', limit: 10, windowMs: 10_000 }).ok, false);

  time += 5_000; // half the window → 5 tokens refill
  const r = checkRateLimit({ key: 'c', limit: 10, windowMs: 10_000 });
  assert.equal(r.ok, true);

  Date.now = now;
});

test('tokens never exceed limit', () => {
  const now = Date.now;
  let time = 1000000;
  Date.now = () => time;

  checkRateLimit({ key: 'd', limit: 3, windowMs: 1000 });
  time += 999_999; // way past window
  const r = checkRateLimit({ key: 'd', limit: 3, windowMs: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 2); // capped at limit - 1

  Date.now = now;
});

test('resetRateLimits clears all', () => {
  checkRateLimit({ key: 'e', limit: 1, windowMs: 60_000 });
  assert.equal(checkRateLimit({ key: 'e', limit: 1, windowMs: 60_000 }).ok, false);
  resetRateLimits();
  assert.equal(checkRateLimit({ key: 'e', limit: 1, windowMs: 60_000 }).ok, true);
});

test('rateLimited returns 429 with retry-after header', async () => {
  const res = rateLimited({ ok: false, remaining: 0, retryAfterMs: 2_500 });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '3'); // ceil(2.5s)
  const body = (await res.json()) as { error: string; retry_after_ms: number };
  assert.equal(body.error, 'rate_limited');
  assert.equal(body.retry_after_ms, 2_500);
});

test('rateLimited retry-after is at least 1 second', () => {
  const res = rateLimited({ ok: false, remaining: 0, retryAfterMs: 50 });
  assert.equal(res.headers.get('retry-after'), '1'); // ceil(0.05s)
});

test('withRateLimit passes through when under the limit', async () => {
  const handler = withRateLimit(
    () => 'wrap-ok',
    { limit: 5, windowMs: 60_000 },
    async () => new Response('ok', { status: 200 }),
  );
  const res = await handler({} as never, {} as never);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('withRateLimit returns 429 after the bucket drains', async () => {
  const handler = withRateLimit(
    () => 'wrap-drain',
    { limit: 2, windowMs: 60_000 },
    async () => new Response('ok', { status: 200 }),
  );
  assert.equal((await handler({} as never, {} as never)).status, 200);
  assert.equal((await handler({} as never, {} as never)).status, 200);
  const third = await handler({} as never, {} as never);
  assert.equal(third.status, 429);
  assert.ok(third.headers.get('retry-after'));
});

test('withRateLimit supports async key functions', async () => {
  let seenKey = '';
  const handler = withRateLimit(
    async () => {
      await Promise.resolve();
      return 'wrap-async';
    },
    { limit: 1, windowMs: 60_000 },
    async () => {
      seenKey = 'called';
      return new Response('ok');
    },
  );
  await handler({} as never, {} as never);
  assert.equal(seenKey, 'called');
});

test('withRateLimit passes req + ctx through to both key fn and handler', async () => {
  const seen: unknown[] = [];
  const handler = withRateLimit(
    (req: { id: string }, ctx: { scope: string }) => {
      seen.push(['key', req, ctx]);
      return `wrap-pass:${req.id}:${ctx.scope}`;
    },
    { limit: 1, windowMs: 60_000 },
    async (req, ctx) => {
      seen.push(['handler', req, ctx]);
      return new Response('ok');
    },
  );
  await handler({ id: 'req-7' }, { scope: 'admin' });
  assert.deepEqual(seen, [
    ['key', { id: 'req-7' }, { scope: 'admin' }],
    ['handler', { id: 'req-7' }, { scope: 'admin' }],
  ]);
});
