import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { authorizeCron } from './cron-auth.ts';

const ORIGINAL_SHIPPIE = process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
const ORIGINAL_VERCEL = process.env.CRON_SECRET;

beforeEach(() => {
  delete process.env.SHIPPIE_INTERNAL_CRON_TOKEN;
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  if (ORIGINAL_SHIPPIE !== undefined) process.env.SHIPPIE_INTERNAL_CRON_TOKEN = ORIGINAL_SHIPPIE;
  if (ORIGINAL_VERCEL !== undefined) process.env.CRON_SECRET = ORIGINAL_VERCEL;
});

function reqWith(authorization?: string): NextRequest {
  return new NextRequest('https://x.test/api/internal/thing', {
    method: 'POST',
    headers: authorization ? { authorization } : undefined,
  });
}

test('rejects when neither secret is configured', () => {
  assert.equal(authorizeCron(reqWith('Bearer any-value')), false);
});

test('rejects when no Authorization header is present', () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = 'abc';
  assert.equal(authorizeCron(reqWith(undefined)), false);
});

test('accepts SHIPPIE_INTERNAL_CRON_TOKEN exact match', () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = 'shippie-token-xyz';
  assert.equal(authorizeCron(reqWith('Bearer shippie-token-xyz')), true);
});

test('accepts CRON_SECRET exact match (Vercel cron)', () => {
  process.env.CRON_SECRET = 'vercel-secret';
  assert.equal(authorizeCron(reqWith('Bearer vercel-secret')), true);
});

test('accepts either token when both are configured', () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = 'one';
  process.env.CRON_SECRET = 'two';
  assert.equal(authorizeCron(reqWith('Bearer one')), true);
  assert.equal(authorizeCron(reqWith('Bearer two')), true);
  assert.equal(authorizeCron(reqWith('Bearer three')), false);
});

test('is case-insensitive on the Bearer prefix', () => {
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = 'abc';
  assert.equal(authorizeCron(reqWith('bearer abc')), true);
  assert.equal(authorizeCron(reqWith('BEARER abc')), true);
});

test('accepts bare token without Bearer prefix (permissive strip)', () => {
  // The `Bearer\s+` prefix is stripped when present, otherwise the
  // value is compared verbatim. Callers get to decide their format;
  // the token still has to match byte-for-byte.
  process.env.SHIPPIE_INTERNAL_CRON_TOKEN = 'abc';
  assert.equal(authorizeCron(reqWith('abc')), true);
  assert.equal(authorizeCron(reqWith('wrong')), false);
});
