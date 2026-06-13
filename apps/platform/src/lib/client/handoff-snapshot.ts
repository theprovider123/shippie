/**
 * Handoff snapshot — the payload that moves "my tools + where I left off"
 * from one device to another. Read from / applied to the two container
 * localStorage blobs (launcher memory + container state) so it works
 * without touching the iframe bridge.
 *
 * v1 carries the saved-tools dock plus, optionally, the local-db rows of
 * one app the sender chose to continue. Curated app ids are deterministic
 * (`app_<slug>`), so rows map slug↔id without a runtime catalog; that also
 * scopes v1 to first-party apps (an imported package isn't on the other
 * device anyway).
 */

export const HANDOFF_SNAPSHOT_SCHEMA = 'shippie.handoff.v1' as const;

export interface HandoffSnapshot {
  schema: typeof HANDOFF_SNAPSHOT_SCHEMA;
  createdAt: string;
  /** Saved-tool slugs (the dock). */
  dock: string[];
  /** Optional: one app's local rows to continue. */
  app?: { slug: string; rows: unknown[] };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LAUNCHER_KEY = 'shippie:launcher:v1';
const CONTAINER_KEY = 'shippie.container.v1';

/** Deterministic curated-app id for a slug (mirrors state.ts `curatedApp`). */
export function curatedAppId(slug: string): string {
  return `app_${slug.replace(/-/g, '_')}`;
}

function readJson(storage: StorageLike, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Saved dock slugs on this device. */
export function readLocalDock(storage: StorageLike): string[] {
  const launcher = readJson(storage, LAUNCHER_KEY);
  const saved = launcher?.saved;
  if (!Array.isArray(saved)) return [];
  return saved.filter((s): s is string => typeof s === 'string');
}

/** Local rows for a slug, or [] when the app has none on this device. */
export function readLocalAppRows(storage: StorageLike, slug: string): unknown[] {
  const container = readJson(storage, CONTAINER_KEY);
  const rowsByApp = container?.rowsByApp;
  if (!rowsByApp || typeof rowsByApp !== 'object') return [];
  const rows = (rowsByApp as Record<string, unknown>)[curatedAppId(slug)];
  return Array.isArray(rows) ? rows : [];
}

/** Build the snapshot to send. `appSlug` set ⇒ include that app's rows. */
export function buildHandoffSnapshot(
  storage: StorageLike,
  options: { appSlug?: string; createdAt: string },
): HandoffSnapshot {
  const snapshot: HandoffSnapshot = {
    schema: HANDOFF_SNAPSHOT_SCHEMA,
    createdAt: options.createdAt,
    dock: readLocalDock(storage),
  };
  if (options.appSlug) {
    snapshot.app = { slug: options.appSlug, rows: readLocalAppRows(storage, options.appSlug) };
  }
  return snapshot;
}

export function isHandoffSnapshot(value: unknown): value is HandoffSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<HandoffSnapshot>;
  if (v.schema !== HANDOFF_SNAPSHOT_SCHEMA) return false;
  if (!Array.isArray(v.dock) || !v.dock.every((s) => typeof s === 'string')) return false;
  if (v.app !== undefined) {
    if (!v.app || typeof v.app !== 'object') return false;
    if (typeof v.app.slug !== 'string' || !Array.isArray(v.app.rows)) return false;
  }
  return true;
}

export interface ApplyResult {
  /** Dock slugs after the union merge. */
  dock: string[];
  /** Slug of the app whose rows were restored, if any. */
  appRestored: string | null;
}

/**
 * Apply a received snapshot to this device's storage: union the dock into
 * launcher memory and write the app's rows into container state. Returns
 * what changed so the caller can re-hydrate stores + open the app. Pure
 * over the injected storage (no globals) so it's unit-testable.
 */
export function applyHandoffSnapshot(storage: StorageLike, snapshot: HandoffSnapshot): ApplyResult {
  // 1. Dock — union (incoming first to preserve its order), deduped.
  const launcher = readJson(storage, LAUNCHER_KEY) ?? {};
  const existingSaved = Array.isArray(launcher.saved)
    ? (launcher.saved as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const dock: string[] = [];
  const seen = new Set<string>();
  for (const slug of [...snapshot.dock, ...existingSaved]) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    dock.push(slug);
  }
  storage.setItem(LAUNCHER_KEY, JSON.stringify({ ...launcher, saved: dock, pinned: dock }));

  // 2. App rows — overwrite the target app's rows with the incoming set.
  let appRestored: string | null = null;
  if (snapshot.app) {
    const container = readJson(storage, CONTAINER_KEY) ?? {};
    const rowsByApp = (container.rowsByApp && typeof container.rowsByApp === 'object'
      ? { ...(container.rowsByApp as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    rowsByApp[curatedAppId(snapshot.app.slug)] = snapshot.app.rows;
    storage.setItem(CONTAINER_KEY, JSON.stringify({ ...container, rowsByApp }));
    appRestored = snapshot.app.slug;
  }

  return { dock, appRestored };
}
