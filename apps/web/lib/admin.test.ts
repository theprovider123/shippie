import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAdmin } from './admin';

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.ADMIN_EMAILS;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = savedEnv;
});

test('returns true for listed email', () => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  assert.equal(isAdmin('admin@example.com'), true);
});

test('returns false for unlisted email', () => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  assert.equal(isAdmin('other@example.com'), false);
});

test('returns false for null/undefined', () => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});

test('case insensitive', () => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  assert.equal(isAdmin('ADMIN@Example.COM'), true);
});

test('multiple emails', () => {
  process.env.ADMIN_EMAILS = 'a@x.com, b@x.com';
  assert.equal(isAdmin('a@x.com'), true);
  assert.equal(isAdmin('b@x.com'), true);
  assert.equal(isAdmin('c@x.com'), false);
});

test('missing env var returns false', () => {
  delete process.env.ADMIN_EMAILS;
  assert.equal(isAdmin('anyone@x.com'), false);
});
