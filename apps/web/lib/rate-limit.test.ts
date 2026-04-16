import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimits } from './rate-limit';

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
