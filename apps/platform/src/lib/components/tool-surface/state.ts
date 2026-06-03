import type { ToolDensity, ToolRuntimeState, ToolTier } from './types';

export type ToolTileChipTone =
  | 'current'
  | 'live'
  | 'saved'
  | 'saving'
  | 'warn'
  | 'tier'
  | 'idle';

export interface ToolTileChip {
  label: string;
  tone: ToolTileChipTone;
}

interface ToolTileChipInput {
  density: ToolDensity;
  runtimeState: ToolRuntimeState;
  isSaving: boolean;
  isSavedToDock: boolean;
  isOffline: boolean;
  offlineWarn: boolean;
  tier?: ToolTier | null;
}

export function toolTileStateChip({
  density,
  runtimeState,
  isSaving,
  isSavedToDock,
  isOffline,
  offlineWarn,
  tier,
}: ToolTileChipInput): ToolTileChip | null {
  if (density === 'drawer') {
    if (runtimeState === 'current') return { label: 'Current', tone: 'current' };
    if (runtimeState === 'live') return { label: 'Live', tone: 'live' };
    if (runtimeState === 'opening') return { label: 'Opening', tone: 'live' };
  }
  if (isSaving) return { label: 'Saving', tone: 'saving' };
  if (isSavedToDock && isOffline) {
    return { label: density === 'dock' ? '' : 'Saved', tone: 'saved' };
  }
  if (offlineWarn) return { label: 'Refresh', tone: 'warn' };
  if (isSavedToDock) return { label: 'Saved', tone: 'saved' };
  if (tier && tier !== 'public') {
    const map: Record<string, string> = {
      private: 'Private',
      team: 'Team',
      local: 'On device',
      unlisted: 'Unlisted',
    };
    return { label: map[tier] ?? '', tone: 'tier' };
  }
  return null;
}
