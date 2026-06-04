/**
 * toolState — the pure, reactive selector for the harmonization contract.
 *
 * It derives a tool's DYNAMIC, per-device state (relationship, offline,
 * update, actions) from raw store inputs. Kept deliberately free of
 * Svelte, IO, and the static ToolDisplay model so it can be unit-tested
 * exhaustively and recomputed on any tick without churning display data.
 *
 * See docs/superpowers/specs/2026-06-04-dock-tools-drawer-harmonization-design.md §3.2.
 */

import type { AppDownloadState } from '$lib/offline/download-app';
import type { UpdateSeverity } from '$lib/container/update-status';
import type {
  OfflineState,
  Relationship,
  ToolActions,
  ToolState,
  UpdateState,
} from './types';

export interface ToolStateInput {
  slug: string;
  isRunning: boolean;
  savedSlugs: ReadonlySet<string>;
  recentSlugs: ReadonlySet<string>;
  /** Missing entry (catalog rows often have none) maps to OfflineState 'none'. */
  download: AppDownloadState | null | undefined;
  updateSeverity: UpdateSeverity | null;
  surface: 'dock' | 'tools' | 'drawer';
}

/** Re-bucket the 8-value AppDownloadState into the 5-value OfflineState. */
export function offlineStateFromDownload(
  download: AppDownloadState | null | undefined,
): OfflineState {
  switch (download) {
    case null:
    case undefined:
    case 'idle':
      return 'none';
    case 'requested':
    case 'downloading':
    case 'verifying':
      return 'saving';
    case 'saved':
      return 'ready';
    case 'partial':
    case 'evicted':
      return 'needs-refresh';
    case 'error':
      return 'failed';
  }
}

/** Collapse the 3-value UpdateSeverity into the contract's UpdateState. */
export function updateStateFromSeverity(severity: UpdateSeverity | null): UpdateState {
  switch (severity) {
    case 'review':
      return 'update';
    case 'attention':
      return 'needs-review';
    case 'quiet':
    case null:
      return 'none';
  }
}

function relationshipFor(input: ToolStateInput): Relationship {
  if (input.isRunning) return 'running';
  if (input.savedSlugs.has(input.slug)) return 'saved';
  if (input.recentSlugs.has(input.slug)) return 'recent';
  return 'catalog';
}

export function toolState(input: ToolStateInput): ToolState {
  const relationship = relationshipFor(input);
  const offlineState = offlineStateFromDownload(input.download);
  const updateState = updateStateFromSeverity(input.updateSeverity);

  const savedButBroken =
    relationship === 'saved' &&
    (offlineState === 'needs-refresh' || offlineState === 'failed');

  const actions: ToolActions = {
    open: true,
    info: true,
    // Hide once saved AND healthy; reappear as Refresh/Repair when the
    // saved offline copy is broken so the fix is never hidden.
    save: relationship !== 'saved' || savedButBroken,
    close: input.isRunning,
    remove: relationship === 'saved' && input.surface !== 'tools',
    review: updateState !== 'none',
  };

  return { relationship, offlineState, updateState, actions };
}
