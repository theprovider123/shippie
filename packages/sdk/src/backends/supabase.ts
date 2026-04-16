/**
 * Supabase backend adapter for the Shippie SDK.
 *
 * Wraps an already-initialized SupabaseClient passed by the maker.
 * The SDK does NOT import @supabase/supabase-js — it uses the client's
 * public API via duck-typing so any compatible version works.
 *
 * Usage:
 *   import { createClient } from '@supabase/supabase-js'
 *   import { shippie } from '@shippie/sdk'
 *
 *   const supabase = createClient(url, anonKey)
 *   shippie.configure({ backend: 'supabase', client: supabase })
 *
 * Spec v5 §2.
 */
import type {
  BackendAdapter,
  BackendAuthAdapter,
  BackendDbAdapter,
  BackendFilesAdapter,
  BackendUser,
} from './types.ts';

// Duck-typed Supabase client — we accept any object that quacks like
// @supabase/supabase-js's SupabaseClient. No version coupling.
interface SupabaseLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null } }>;
    signInWithOAuth(opts: { provider: string; options?: { redirectTo?: string } }): Promise<unknown>;
    signOut(): Promise<unknown>;
    getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
    onAuthStateChange(cb: (event: string, session: unknown) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  from(table: string): {
    select(columns?: string): { eq(col: string, val: unknown): { single(): Promise<{ data: unknown; error: unknown }>; limit(n: number): { range(from: number, to: number): Promise<{ data: unknown[]; error: unknown }> } } };
    upsert(row: unknown): Promise<{ error: unknown }>;
    delete(): { eq(col: string, val: unknown): Promise<{ error: unknown }> };
  };
  storage: {
    from(bucket: string): {
      upload(path: string, blob: Blob): Promise<{ data: { path: string } | null; error: unknown }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
}

export function createSupabaseAdapter(client: unknown): BackendAdapter {
  const sb = client as SupabaseLike;

  const auth: BackendAuthAdapter = {
    async getUser() {
      const { data } = await sb.auth.getUser();
      if (!data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        name: (data.user.user_metadata?.name as string) ?? null,
        image: (data.user.user_metadata?.avatar_url as string) ?? null,
      };
    },
    async signIn(returnTo) {
      await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnTo ?? window.location.href },
      });
    },
    async signOut() {
      await sb.auth.signOut();
    },
    onChange(listener) {
      const { data } = sb.auth.onAuthStateChange(async () => {
        const user = await auth.getUser();
        listener(user);
      });
      return () => data.subscription.unsubscribe();
    },
    async getToken() {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };

  const db: BackendDbAdapter = {
    async set(collection, key, value) {
      const { error } = await sb.from(collection).upsert({ id: key, data: value });
      if (error) throw new Error(`shippie.db.set failed: ${String(error)}`);
    },
    async get<T>(collection: string, key: string): Promise<T | null> {
      const { data, error } = await sb.from(collection).select('data').eq('id', key).single();
      if (error) return null;
      return (data as { data: T })?.data ?? null;
    },
    async list<T>(collection: string, opts?: { limit?: number; offset?: number }): Promise<T[]> {
      const limit = opts?.limit ?? 100;
      const offset = opts?.offset ?? 0;
      const { data, error } = await sb.from(collection).select('data').eq('id', '*').limit(limit).range(offset, offset + limit - 1);
      if (error) return [];
      return (data as { data: T }[]).map((r) => r.data);
    },
    async delete(collection, key) {
      await sb.from(collection).delete().eq('id', key);
    },
  };

  const files: BackendFilesAdapter = {
    async upload(blob, filename) {
      const bucket = 'shippie-files';
      const path = `${Date.now()}-${filename}`;
      const { data, error } = await sb.storage.from(bucket).upload(path, blob);
      if (error || !data) throw new Error(`shippie.files.upload failed: ${String(error)}`);
      const { data: urlData } = sb.storage.from(bucket).getPublicUrl(data.path);
      return { key: data.path, url: urlData.publicUrl };
    },
    async get(key) {
      const bucket = 'shippie-files';
      const { data } = sb.storage.from(bucket).getPublicUrl(key);
      return data.publicUrl;
    },
    async delete(key) {
      const bucket = 'shippie-files';
      await sb.storage.from(bucket).remove([key]);
    },
  };

  return { type: 'supabase', auth, db, files };
}
