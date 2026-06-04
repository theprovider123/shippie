import { describe, expect, test } from 'vitest';
import { toolState, type ToolStateInput } from './tool-state';
import type { AppDownloadState } from '$lib/offline/download-app';
import type { UpdateSeverity } from '$lib/container/update-status';
import type { OfflineState, UpdateState } from './types';

function input(overrides: Partial<ToolStateInput> = {}): ToolStateInput {
  return {
    slug: 'demo',
    isRunning: false,
    savedSlugs: new Set<string>(),
    recentSlugs: new Set<string>(),
    download: 'idle',
    updateSeverity: null,
    surface: 'dock',
    ...overrides,
  };
}

describe('toolState — offlineState bucket (every AppDownloadState)', () => {
  const cases: Array<[AppDownloadState | null | undefined, OfflineState]> = [
    [null, 'none'],
    [undefined, 'none'],
    ['idle', 'none'],
    ['requested', 'saving'],
    ['downloading', 'saving'],
    ['verifying', 'saving'],
    ['saved', 'ready'],
    ['partial', 'needs-refresh'],
    ['evicted', 'needs-refresh'],
    ['error', 'failed'],
  ];
  test.each(cases)('download %s -> offlineState %s', (download, expected) => {
    expect(toolState(input({ download })).offlineState).toBe(expected);
  });
});

describe('toolState — updateState (every UpdateSeverity)', () => {
  const cases: Array<[UpdateSeverity | null, UpdateState]> = [
    [null, 'none'],
    ['quiet', 'none'],
    ['review', 'update'],
    ['attention', 'needs-review'],
  ];
  test.each(cases)('updateSeverity %s -> updateState %s', (updateSeverity, expected) => {
    expect(toolState(input({ updateSeverity })).updateState).toBe(expected);
  });
});

describe('toolState — relationship priority running > saved > recent > catalog', () => {
  test('running wins over saved and recent', () => {
    expect(
      toolState(
        input({
          isRunning: true,
          savedSlugs: new Set(['demo']),
          recentSlugs: new Set(['demo']),
        }),
      ).relationship,
    ).toBe('running');
  });

  test('saved wins over recent', () => {
    expect(
      toolState(
        input({ savedSlugs: new Set(['demo']), recentSlugs: new Set(['demo']) }),
      ).relationship,
    ).toBe('saved');
  });

  test('recent when only in recent', () => {
    expect(toolState(input({ recentSlugs: new Set(['demo']) })).relationship).toBe('recent');
  });

  test('catalog when in no set and not running', () => {
    expect(toolState(input()).relationship).toBe('catalog');
  });
});

describe('toolState — actions', () => {
  test('open and info are always true', () => {
    const { actions } = toolState(input({ surface: 'tools' }));
    expect(actions.open).toBe(true);
    expect(actions.info).toBe(true);
  });

  test('close is true only when running', () => {
    expect(toolState(input({ isRunning: true })).actions.close).toBe(true);
    expect(toolState(input({ isRunning: false })).actions.close).toBe(false);
  });

  test('remove is true for a saved tool off the tools surface', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), surface: 'dock' })).actions.remove,
    ).toBe(true);
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), surface: 'drawer' })).actions.remove,
    ).toBe(true);
  });

  test('remove is never true on the tools surface', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), surface: 'tools' })).actions.remove,
    ).toBe(false);
  });

  test('review tracks updateState !== none', () => {
    expect(toolState(input({ updateSeverity: 'attention' })).actions.review).toBe(true);
    expect(toolState(input({ updateSeverity: 'review' })).actions.review).toBe(true);
    expect(toolState(input({ updateSeverity: 'quiet' })).actions.review).toBe(false);
    expect(toolState(input({ updateSeverity: null })).actions.review).toBe(false);
  });
});

describe('toolState — save action (the bug-magnet: saved-but-broken keeps repair visible)', () => {
  test('save is true for an unsaved catalog tool', () => {
    expect(toolState(input()).actions.save).toBe(true);
  });

  test('save is true for a recent (not yet saved) tool', () => {
    expect(toolState(input({ recentSlugs: new Set(['demo']) })).actions.save).toBe(true);
  });

  test('save HIDES for a saved tool whose offline copy is healthy (ready)', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'saved' })).actions.save,
    ).toBe(false);
  });

  test('save HIDES for a saved tool with no offline copy yet (none) — saving handled elsewhere', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'idle' })).actions.save,
    ).toBe(false);
  });

  test('save STAYS VISIBLE (repair) for a saved tool whose offline copy needs-refresh', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'partial' })).actions.save,
    ).toBe(true);
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'evicted' })).actions.save,
    ).toBe(true);
  });

  test('save STAYS VISIBLE (repair) for a saved tool whose offline copy failed', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'error' })).actions.save,
    ).toBe(true);
  });

  test('save HIDES while a saved tool is actively saving (in progress, not broken)', () => {
    expect(
      toolState(input({ savedSlugs: new Set(['demo']), download: 'downloading' })).actions.save,
    ).toBe(false);
  });
});
