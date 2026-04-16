import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCompatReport } from './compat-report';
import type { ShippieJson } from '@shippie/shared';

function files(entries: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
}

const base: ShippieJson = { version: 1, slug: 'x', type: 'app', name: 'X', category: 'tools' };

test('matching SDK usage + declaration produces score 5', () => {
  const r = runCompatReport({
    files: files({ 'app.js': 'shippie.auth.signIn(); shippie.db.set("x","y",{})' }),
    manifest: { ...base, permissions: { auth: true, storage: 'rw' } },
  });
  assert.ok(r.findings.some((f) => f.severity === 'match' && f.capability === 'auth'));
  assert.ok(r.findings.some((f) => f.severity === 'match' && f.capability === 'storage'));
});

test('SDK usage without declaration produces violation', () => {
  const r = runCompatReport({
    files: files({ 'app.js': 'shippie.files.upload("photo.png")' }),
    manifest: { ...base, permissions: { files: false } },
  });
  assert.ok(r.findings.some((f) => f.severity === 'violation' && f.capability === 'files'));
  assert.ok(r.score < 5);
});

test('declaration without usage produces declared_unused warning', () => {
  const r = runCompatReport({
    files: files({ 'app.js': 'console.log("clean")' }),
    manifest: { ...base, permissions: { notifications: true } },
  });
  assert.ok(r.findings.some((f) => f.severity === 'declared_unused' && f.capability === 'notifications'));
});

test('score floors at 1', () => {
  const r = runCompatReport({
    files: files({ 'app.js': 'shippie.auth.signIn(); shippie.db.set(); shippie.files.upload(); shippie.notifications.send()' }),
    manifest: base, // no permissions declared
  });
  assert.equal(r.score, 1);
});
