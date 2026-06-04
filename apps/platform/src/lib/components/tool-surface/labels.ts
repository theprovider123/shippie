/**
 * labels.ts — the SINGLE source of relationship / update / save copy for
 * the tool-surface primitives. ToolRow and ToolCard import their labels
 * from here and contain no inline relationship/update/save string
 * literals (enforced by the guardrail test, spec §10.1).
 *
 * The literal words ("Saved", "Update", "Review", …) appear validly in
 * unrelated maker/account/docs UI, so the guard checks IMPORT of these
 * functions in the primitives — it does not globally ban the words.
 */

import type { OfflineState, Relationship, UpdateState } from './types';

export function relationshipLabel(relationship: Relationship): string {
  switch (relationship) {
    case 'running':
      return 'Open now';
    case 'recent':
      return 'Recent';
    case 'saved':
      return 'Saved';
    case 'catalog':
      return '';
  }
}

export function updateChipLabel(updateState: UpdateState): string | null {
  switch (updateState) {
    case 'update':
      return 'Update';
    case 'needs-review':
      return 'Review';
    case 'none':
      return null;
  }
}

/**
 * Label for the `save` action. Keys purely off offlineState: only a saved
 * tool can have a broken (`failed` / `needs-refresh`) offline copy, so a
 * broken state unambiguously means the repair case — and this stays
 * correct when the dominant relationship is `running` (running + saved +
 * broken still labels Repair, not Save). Spec §3.4.
 */
export function saveActionLabel(offlineState: OfflineState): string {
  if (offlineState === 'failed') return 'Repair';
  if (offlineState === 'needs-refresh') return 'Refresh';
  return 'Save';
}
