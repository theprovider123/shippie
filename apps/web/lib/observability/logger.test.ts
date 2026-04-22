import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { withLogger, TRACE_ID_HEADER } from './logger.ts';

// Silence the logger during tests — we're not asserting on stdout.
const origLog = console.log;
const origError = console.error;
console.log = () => {};
console.error = () => {};
process.on('exit', () => {
  console.log = origLog;
  console.error = origError;
});

function req(headers?: Record<string, string>): NextRequest {
  const init: { method: string; headers?: Record<string, string> } = { method: 'POST' };
  if (headers) init.headers = headers;
  return new NextRequest('https://example.test/api/x', init);
}

test('mints a trace id when none is supplied', async () => {
  const wrapped = withLogger('test', async () => NextResponse.json({ ok: true }));
  const res = await wrapped(req(), undefined);
  const id = res.headers.get(TRACE_ID_HEADER);
  assert.ok(id, 'trace id should be set');
  assert.match(id!, /^[a-f0-9]{16}$/);
});

test('honors an incoming x-shippie-trace-id header', async () => {
  const wrapped = withLogger('test', async () => NextResponse.json({ ok: true }));
  const res = await wrapped(req({ [TRACE_ID_HEADER]: 'upstream-abc-123' }), undefined);
  assert.equal(res.headers.get(TRACE_ID_HEADER), 'upstream-abc-123');
});

test('rejects malformed trace ids and mints a fresh one', async () => {
  const wrapped = withLogger('test', async () => NextResponse.json({ ok: true }));
  const res = await wrapped(req({ [TRACE_ID_HEADER]: 'bad id with spaces!' }), undefined);
  const id = res.headers.get(TRACE_ID_HEADER);
  assert.ok(id);
  assert.notEqual(id, 'bad id with spaces!');
  assert.match(id!, /^[a-f0-9]{16}$/);
});

test('does not overwrite a trace id the handler already set', async () => {
  const wrapped = withLogger('test', async () => {
    const r = NextResponse.json({ ok: true });
    r.headers.set(TRACE_ID_HEADER, 'handler-set');
    return r;
  });
  const res = await wrapped(req(), undefined);
  assert.equal(res.headers.get(TRACE_ID_HEADER), 'handler-set');
});

test('converts handler throw into 500 with trace id + stable error envelope', async () => {
  const wrapped = withLogger('test', async () => {
    throw new Error('kaboom');
  });
  const res = await wrapped(req({ [TRACE_ID_HEADER]: 'upstream-42' }), undefined);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get(TRACE_ID_HEADER), 'upstream-42');
  const body = (await res.json()) as { error: string; trace_id: string };
  assert.equal(body.error, 'internal_error');
  assert.equal(body.trace_id, 'upstream-42');
});
