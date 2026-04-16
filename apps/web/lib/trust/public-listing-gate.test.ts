import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublicListingGate } from './public-listing-gate';
import type { ShippieJson } from '@shippie/shared';

const base: ShippieJson = { version: 1, slug: 'x', type: 'app', name: 'X', category: 'tools' };

test('non-public visibility always allowed', () => {
  for (const v of ['unlisted', 'private_org', 'private_link'] as const) {
    const r = checkPublicListingGate({ manifest: base, visibility: v });
    assert.equal(r.allowed, true);
  }
});

test('public with all required fields allowed', () => {
  const r = checkPublicListingGate({
    manifest: {
      ...base,
      description: 'A sufficient description for the listing.',
      store_metadata: { support_url: 'https://x/s', privacy_url: 'https://x/p' },
    },
    visibility: 'public',
  });
  assert.equal(r.allowed, true);
  assert.equal(r.violations.length, 0);
});

test('public missing support_url produces violation', () => {
  const r = checkPublicListingGate({
    manifest: { ...base, description: 'A sufficient description.', store_metadata: { privacy_url: 'https://x/p' } },
    visibility: 'public',
  });
  assert.equal(r.allowed, false);
  assert.ok(r.violations.some((v) => v.field.includes('support_url')));
});

test('public with short description produces violation', () => {
  const r = checkPublicListingGate({
    manifest: { ...base, description: 'Short', store_metadata: { support_url: 'https://x', privacy_url: 'https://x' } },
    visibility: 'public',
  });
  assert.equal(r.allowed, false);
  assert.ok(r.violations.some((v) => v.field === 'description'));
});
