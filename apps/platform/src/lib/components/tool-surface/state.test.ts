import { describe, expect, test } from 'vitest';
import { toolTileStateChip } from './state';

const base = {
  density: 'card' as const,
  runtimeState: 'idle' as const,
  isSaving: false,
  isSavedToDock: false,
  isOffline: false,
  offlineWarn: false,
};

describe('toolTileStateChip', () => {
  test('does not show a permanent saving chip for saved tools without an offline status', () => {
    expect(toolTileStateChip({ ...base, isSavedToDock: true })).toEqual({
      label: 'Saved',
      tone: 'saved',
    });
  });

  test('shows refresh when a saved offline copy failed or needs repair', () => {
    expect(toolTileStateChip({ ...base, isSavedToDock: true, offlineWarn: true })).toEqual({
      label: 'Refresh',
      tone: 'warn',
    });
  });

  test('still shows saving while an offline download is actually in progress', () => {
    expect(toolTileStateChip({ ...base, isSavedToDock: true, isSaving: true })).toEqual({
      label: 'Saving',
      tone: 'saving',
    });
  });

  test('drawer runtime state wins over saved state', () => {
    expect(
      toolTileStateChip({
        ...base,
        density: 'drawer',
        runtimeState: 'live',
        isSavedToDock: true,
      }),
    ).toEqual({
      label: 'Live',
      tone: 'live',
    });
  });
});
