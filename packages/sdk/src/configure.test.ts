import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Re-import fresh module state per test isn't easy with node:test,
// so we test the public API surface and accept shared state.
import { configure, isConfigured, getBackendMeta, getAdapter } from './configure';

// Minimal mock that satisfies the duck-typed SupabaseClient shape
const mockSupabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: '1', email: 'test@x.com', user_metadata: {} } } }),
    signInWithOAuth: async () => ({}),
    signOut: async () => ({}),
    getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), limit: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
    upsert: async () => ({ error: null }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'x' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://x' } }),
      remove: async () => ({ error: null }),
    }),
  },
};

test('configure with supabase succeeds', () => {
  configure({ backend: 'supabase', client: mockSupabase });
  assert.equal(isConfigured(), true);
});

test('getAdapter returns adapter after configure', () => {
  configure({ backend: 'supabase', client: mockSupabase });
  const adapter = getAdapter();
  assert.equal(adapter.type, 'supabase');
});

test('configure with firebase throws (not yet supported)', () => {
  assert.throws(
    () => configure({ backend: 'firebase', client: {} }),
    /Firebase adapter ships in a future release/,
  );
});

test('configure with unknown backend throws', () => {
  assert.throws(
    () => configure({ backend: 'unknown' as 'supabase', client: {} }),
    /Unknown backend/,
  );
});

test('getBackendMeta returns nulls in Node (no window)', () => {
  const meta = getBackendMeta();
  assert.equal(meta.backend_type, null);
  assert.equal(meta.backend_url, null);
});
