import { describe, expect, it } from 'bun:test';
import { summarizeLaunchEntries, type LaunchEntry } from './index.tsx';
import { appIdForShowcase } from './boot.tsx';

describe('summarizeLaunchEntries', () => {
  it('counts entries by mode and keeps the latest label', () => {
    const entries: LaunchEntry[] = [
      {
        id: 'b',
        modeId: 'handover',
        modeLabel: 'Handover',
        intent: 'handover-note',
        note: 'packed bag',
        value: null,
        unit: null,
        createdAt: 2,
      },
      {
        id: 'a',
        modeId: 'meds',
        modeLabel: 'Meds',
        intent: 'meds-logged',
        note: 'inhaler',
        value: 1,
        unit: 'dose',
        createdAt: 1,
      },
    ];

    expect(summarizeLaunchEntries(entries, 3)).toEqual({
      total: 2,
      signalCount: 3,
      totalValue: 1,
      counts: { handover: 1, meds: 1 },
      lastLabel: 'Handover',
    });
  });
});

describe('appIdForShowcase', () => {
  it('uses explicit app ids before deriving from slug', () => {
    expect(appIdForShowcase({ slug: 'crewtrip' }, 'crewtrip')).toBe('crewtrip');
    expect(appIdForShowcase({ appId: 'app_recipe_saver', slug: 'recipe' })).toBe('app_recipe_saver');
  });

  it('derives stable app ids from manifest slugs', () => {
    expect(appIdForShowcase({ slug: 'daily-puzzle' })).toBe('app_daily_puzzle');
  });
});
