/**
 * Version snapshots — capture the full sections array of a pitch at a
 * point in time, store it, and restore it later. Versions are stored
 * as the entire serialised sections snapshot rather than diffs because
 * (a) snapshots are small (typed markdown), (b) restoring is just
 * `setState(snapshot)`, no replay logic, (c) compare can call
 * `diffLines` directly without reconstruction.
 */

import type { Section } from './store.ts';

export interface Version {
  id: string;
  pitch_id: string;
  /** User-supplied label, e.g. "v1 — pre-budget review". Defaults to ISO timestamp. */
  label: string;
  sections: Section[];
  created_at: string;
}

export function newVersionId(): string {
  return `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Snapshot the current sections of a pitch. */
export function snapshot(
  pitchId: string,
  sections: Section[],
  label?: string,
): Version {
  const created_at = new Date().toISOString();
  return {
    id: newVersionId(),
    pitch_id: pitchId,
    label: label?.trim() || created_at.slice(0, 16).replace('T', ' '),
    // Deep-clone so subsequent edits to the live sections don't mutate
    // the stored snapshot.
    sections: sections.map((s) => ({ ...s })),
    created_at,
  };
}

/**
 * Return a new sections array reflecting the version's snapshot.
 * Caller wires this into setState — restore doesn't itself mutate.
 */
export function restore(version: Version): Section[] {
  return version.sections.map((s) => ({ ...s }));
}

/** Sort versions newest-first for the timeline UI. */
export function sortVersions(versions: Version[]): Version[] {
  return [...versions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
