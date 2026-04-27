/**
 * Bundle content merge — Phase 5.2 of the master plan.
 *
 * Maker-bundled content (recipes pre-shipped with the app, default
 * categories, sample data) lives in the same local table as the
 * user's own data. Telling them apart is the `_origin` column:
 *
 *   _origin: 'bundle'   — shipped with the app at version _bundleVersion
 *   _origin: 'user'     — created by the user; never touched by updates
 *
 * `_userModified: 1` on a bundle row marks it as edited by the user.
 * On the next deploy, the maker's new version of that row is captured
 * in a shadow table for "reset to original" but does NOT overwrite the
 * user's edit — user always wins.
 *
 * Pure functional: takes the local rows + the new bundle's content and
 * returns a structured merge plan. The wrapper executes the plan via
 * its SQLite binding.
 */

export interface ContentRow {
  id: string;
  /** Arbitrary row data — opaque to the merge engine. */
  values: Record<string, unknown>;
  _origin: 'bundle' | 'user';
  _bundleVersion?: number;
  _userModified?: boolean;
}

export interface BundleRow {
  id: string;
  values: Record<string, unknown>;
}

export type MergeOp =
  | { kind: 'insert'; row: ContentRow }
  | { kind: 'update'; id: string; values: Record<string, unknown>; bundleVersion: number }
  | { kind: 'shadow_only'; id: string; bundleValues: Record<string, unknown>; bundleVersion: number }
  | { kind: 'soft_delete'; id: string };

export interface ContentMergePlan {
  ops: MergeOp[];
  summary: {
    inserted: number;
    updated: number;
    preservedUserEdits: number;
    softDeleted: number;
  };
}

export interface ContentMergeInput {
  /** Rows currently in the user's local table. */
  local: ContentRow[];
  /** New bundle content — what the maker shipped in this version. */
  bundle: BundleRow[];
  /** Version number of the new bundle. Stamped onto inserted/updated rows. */
  bundleVersion: number;
}

/**
 * Merge maker-bundled content into a local table.
 *
 * Rules:
 *   1. Bundle row not in local → INSERT with _origin='bundle'.
 *   2. Bundle row in local AND _userModified='false' → UPDATE values, bump _bundleVersion.
 *   3. Bundle row in local AND _userModified='true' → DO NOT touch the row.
 *      Capture the bundle's current values in the shadow so the user can
 *      "reset to maker's version" later.
 *   4. Local bundle row not in new bundle → soft_delete (mark _origin
 *      hidden, never hard-delete; user might have notes attached).
 *   5. Local user-origin rows → never touched.
 */
export function planContentMerge(input: ContentMergeInput): ContentMergePlan {
  const localById = new Map(input.local.map((r) => [r.id, r]));
  const bundleById = new Map(input.bundle.map((r) => [r.id, r]));
  const ops: MergeOp[] = [];
  let inserted = 0;
  let updated = 0;
  let preserved = 0;
  let softDeleted = 0;

  // Pass 1: bundle rows.
  for (const br of input.bundle) {
    const local = localById.get(br.id);
    if (!local) {
      ops.push({
        kind: 'insert',
        row: {
          id: br.id,
          values: br.values,
          _origin: 'bundle',
          _bundleVersion: input.bundleVersion,
          _userModified: false,
        },
      });
      inserted++;
      continue;
    }
    // Don't touch user-origin rows. They happen to share an id by accident.
    if (local._origin === 'user') continue;
    if (local._userModified) {
      // User wins. Capture maker's version for "reset" but don't apply.
      ops.push({
        kind: 'shadow_only',
        id: br.id,
        bundleValues: br.values,
        bundleVersion: input.bundleVersion,
      });
      preserved++;
    } else {
      // Plain update path.
      ops.push({
        kind: 'update',
        id: br.id,
        values: br.values,
        bundleVersion: input.bundleVersion,
      });
      updated++;
    }
  }

  // Pass 2: local bundle rows that vanished from the new bundle.
  for (const local of input.local) {
    if (local._origin !== 'bundle') continue;
    if (bundleById.has(local.id)) continue;
    ops.push({ kind: 'soft_delete', id: local.id });
    softDeleted++;
  }

  return {
    ops,
    summary: {
      inserted,
      updated,
      preservedUserEdits: preserved,
      softDeleted,
    },
  };
}
