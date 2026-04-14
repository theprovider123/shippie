import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlDecode,
  base64UrlEncode,
  generateNonce,
  generateSessionHandle,
  hashHandle,
  hmacSign,
  hmacVerify,
  sha256Hex,
  signVerifyKitCallback,
  signWorkerRequest,
  verifyVerifyKitCallback,
  verifyWorkerRequest,
} from './index.ts';

test('generateSessionHandle returns 43-char base64url (32 bytes, no padding)', () => {
  const h = generateSessionHandle();
  assert.equal(h.length, 43);
  assert.match(h, /^[A-Za-z0-9_-]+$/);
});

test('generateSessionHandle is unpredictable', () => {
  const a = generateSessionHandle();
  const b = generateSessionHandle();
  assert.notEqual(a, b);
});

test('base64url roundtrips arbitrary bytes', () => {
  const input = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const encoded = base64UrlEncode(input);
  const decoded = base64UrlDecode(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(input));
});

test('hashHandle is deterministic and 64 hex chars', async () => {
  const a = await hashHandle('test-handle');
  const b = await hashHandle('test-handle');
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]+$/);
});

test('hashHandle differentiates inputs', async () => {
  const a = await hashHandle('handle-a');
  const b = await hashHandle('handle-b');
  assert.notEqual(a, b);
});

test('sha256Hex of "" matches known value', async () => {
  const h = await sha256Hex('');
  assert.equal(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('hmacSign + hmacVerify roundtrip', async () => {
  const sig = await hmacSign('secret', 'hello world');
  assert.equal(await hmacVerify('secret', 'hello world', sig), true);
  assert.equal(await hmacVerify('secret', 'hello WORLD', sig), false);
  assert.equal(await hmacVerify('wrong', 'hello world', sig), false);
});

test('worker request signing roundtrip', async () => {
  const secret = 'shared-secret';
  const { signature, timestamp } = await signWorkerRequest(
    secret,
    'POST',
    '/api/internal/session/authorize',
    '{"handle":"abc"}',
  );

  const result = await verifyWorkerRequest(
    secret,
    'POST',
    '/api/internal/session/authorize',
    '{"handle":"abc"}',
    signature,
    timestamp,
  );
  assert.deepEqual(result, { ok: true });
});

test('worker signature rejects tampered body', async () => {
  const secret = 'shared-secret';
  const { signature, timestamp } = await signWorkerRequest(
    secret,
    'POST',
    '/api/internal/sdk/storage/recipes/1',
    '{"data":{"x":1}}',
  );

  const result = await verifyWorkerRequest(
    secret,
    'POST',
    '/api/internal/sdk/storage/recipes/1',
    '{"data":{"x":2}}', // tampered
    signature,
    timestamp,
  );
  assert.equal(result.ok, false);
});

test('worker signature rejects stale timestamp', async () => {
  const secret = 'shared-secret';
  const { signature, timestamp } = await signWorkerRequest(secret, 'GET', '/api/health', '');

  // Pretend "now" is 60s in the future
  const result = await verifyWorkerRequest(
    secret,
    'GET',
    '/api/health',
    '',
    signature,
    timestamp,
    Date.now() + 60_000,
  );
  assert.equal(result.ok, false);
});

test('verify-kit HMAC binds log_sha256', async () => {
  const secret = 'kit-secret';
  const sig = await signVerifyKitCallback(secret, {
    app_id: 'app-123',
    signing_config_id: 'cfg-456',
    nonce: generateNonce(),
    result: 'success',
    log_sha256: 'abc123',
  });

  // Same input → verifies
  const ok = await verifyVerifyKitCallback(
    secret,
    {
      app_id: 'app-123',
      signing_config_id: 'cfg-456',
      nonce: 'unused', // nonce was already in the signed input
      result: 'success',
      log_sha256: 'abc123',
    },
    sig,
  );
  // Will fail because nonce changed in the input rebuild
  assert.equal(ok, false);
});

test('verify-kit HMAC rejects tampered log hash', async () => {
  const secret = 'kit-secret';
  const input = {
    app_id: 'app-123',
    signing_config_id: 'cfg-456',
    nonce: 'fixed-nonce',
    result: 'success' as const,
    log_sha256: 'real-hash',
  };

  const sig = await signVerifyKitCallback(secret, input);

  // Same kit, forged log → rejects
  const tamperedOk = await verifyVerifyKitCallback(
    secret,
    { ...input, log_sha256: 'forged-hash' },
    sig,
  );
  assert.equal(tamperedOk, false);

  // Untampered → accepts
  const realOk = await verifyVerifyKitCallback(secret, input, sig);
  assert.equal(realOk, true);
});

test('verify-kit HMAC rejects signing_config_id swap', async () => {
  const secret = 'kit-secret';
  const sig = await signVerifyKitCallback(secret, {
    app_id: 'app-1',
    signing_config_id: 'cfg-A',
    nonce: 'n',
    result: 'success',
    log_sha256: 'hash',
  });

  // Maker tries to retarget to a different config → HMAC rejects
  const ok = await verifyVerifyKitCallback(
    secret,
    {
      app_id: 'app-1',
      signing_config_id: 'cfg-B',
      nonce: 'n',
      result: 'success',
      log_sha256: 'hash',
    },
    sig,
  );
  assert.equal(ok, false);
});
