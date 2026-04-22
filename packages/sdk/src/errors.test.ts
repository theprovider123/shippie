import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShippieSDKError, isShippieSDKError } from './errors.ts';

test('ShippieSDKError carries code + message + cause', () => {
  const cause = new Error('underlying');
  const err = new ShippieSDKError('backend_error', 'boom', cause);
  assert.equal(err.code, 'backend_error');
  assert.equal(err.message, 'boom');
  assert.equal(err.cause, cause);
  assert.equal(err.name, 'ShippieSDKError');
});

test('ShippieSDKError is an Error', () => {
  const err = new ShippieSDKError('not_configured', 'x');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ShippieSDKError);
});

test('isShippieSDKError narrows the type', () => {
  const err: unknown = new ShippieSDKError('signed_out', 'nope');
  assert.equal(isShippieSDKError(err), true);
  if (isShippieSDKError(err)) {
    assert.equal(err.code, 'signed_out'); // type-narrowed
  }
});

test('isShippieSDKError rejects plain errors', () => {
  assert.equal(isShippieSDKError(new Error('plain')), false);
  assert.equal(isShippieSDKError(null), false);
  assert.equal(isShippieSDKError('str'), false);
  assert.equal(isShippieSDKError({ code: 'not_configured' }), false);
});

test('cause is optional', () => {
  const err = new ShippieSDKError('not_configured', 'x');
  assert.equal(err.cause, undefined);
});
