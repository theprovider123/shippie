/**
 * BackendAdapter — the contract a BYO backend must satisfy.
 *
 * The adapter wraps a maker-provided client (Supabase, Firebase, etc.)
 * and exposes a unified API that the SDK delegates to. Shippie never
 * constructs the backend client itself — the maker passes an
 * already-initialized instance via shippie.configure().
 *
 * Spec v5 §2 (BYO backend).
 */

export interface BackendUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

export interface BackendAuthAdapter {
  getUser(): Promise<BackendUser | null>;
  signIn(returnTo?: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(listener: (user: BackendUser | null) => void): () => void;
  /** Returns the current session JWT for use in Authorization headers. */
  getToken(): Promise<string | null>;
}

export interface BackendDbAdapter {
  set<T>(collection: string, key: string, value: T): Promise<void>;
  get<T>(collection: string, key: string): Promise<T | null>;
  list<T>(collection: string, opts?: { limit?: number; offset?: number }): Promise<T[]>;
  delete(collection: string, key: string): Promise<void>;
}

export interface BackendFilesAdapter {
  upload(blob: Blob, filename: string): Promise<{ key: string; url: string }>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export interface BackendAdapter {
  type: string;
  auth: BackendAuthAdapter;
  db: BackendDbAdapter;
  files: BackendFilesAdapter;
}
