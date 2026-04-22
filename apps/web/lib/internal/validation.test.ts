import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { parseBody, parseRawBody, parseValue } from './validation.ts';

const Schema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(0),
});

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('https://example.test/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('parseBody returns ok on valid input', async () => {
  const res = await parseBody(jsonRequest({ name: 'alice', count: 3 }), Schema);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.data, { name: 'alice', count: 3 });
  }
});

test('parseBody rejects schema violations with 400 + issues[]', async () => {
  const res = await parseBody(jsonRequest({ name: '', count: -1 }), Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.response.status, 400);
    const json = (await res.response.json()) as { error: string; issues: unknown[] };
    assert.equal(json.error, 'invalid_body');
    assert.ok(Array.isArray(json.issues));
    assert.ok(json.issues.length >= 1);
  }
});

test('parseBody rejects malformed JSON with 400 invalid_json', async () => {
  const res = await parseBody(jsonRequest('{not valid json'), Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.response.status, 400);
    const json = (await res.response.json()) as { error: string };
    assert.equal(json.error, 'invalid_json');
  }
});

test('parseRawBody returns ok on valid input', () => {
  const res = parseRawBody(JSON.stringify({ name: 'bob', count: 0 }), Schema);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.name, 'bob');
});

test('parseRawBody rejects malformed JSON with invalid_json', async () => {
  const res = parseRawBody('{{{', Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    const json = (await res.response.json()) as { error: string };
    assert.equal(json.error, 'invalid_json');
  }
});

test('parseRawBody rejects schema violations with invalid_body', async () => {
  const res = parseRawBody(JSON.stringify({ name: 'bob' }), Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    const json = (await res.response.json()) as { error: string };
    assert.equal(json.error, 'invalid_body');
  }
});

test('parseValue validates already-extracted objects', () => {
  const ok = parseValue({ name: 'c', count: 1 }, Schema);
  assert.equal(ok.ok, true);

  const bad = parseValue({ name: 'c' }, Schema);
  assert.equal(bad.ok, false);
});

test('parseBody reports multiple issues at once', async () => {
  const res = await parseBody(jsonRequest({ name: '', count: -5 }), Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    const json = (await res.response.json()) as { issues: Array<{ path: string }> };
    const paths = json.issues.map((i) => i.path).sort();
    assert.deepEqual(paths, ['count', 'name']);
  }
});

test('parseBody accepts coerced numbers via z.coerce', async () => {
  const Coerced = z.object({ count: z.coerce.number().int() });
  const res = await parseBody(jsonRequest({ count: '42' }), Coerced);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.count, 42);
});

test('parseBody applies schema defaults', async () => {
  const WithDefault = z.object({
    name: z.string(),
    role: z.enum(['user', 'admin']).default('user'),
  });
  const res = await parseBody(jsonRequest({ name: 'x' }), WithDefault);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.role, 'user');
});

test('parseValue rejects null and primitives against an object schema', async () => {
  const bad1 = parseValue(null, Schema);
  assert.equal(bad1.ok, false);
  const bad2 = parseValue(42, Schema);
  assert.equal(bad2.ok, false);
  const bad3 = parseValue('oops', Schema);
  assert.equal(bad3.ok, false);
});

test('parseRawBody rejects empty string with invalid_json', async () => {
  const res = parseRawBody('', Schema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    const json = (await res.response.json()) as { error: string };
    assert.equal(json.error, 'invalid_json');
  }
});
