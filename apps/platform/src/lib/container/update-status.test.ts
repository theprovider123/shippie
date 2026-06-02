import { describe, expect, test } from 'vitest';
import type { UpdateCard } from './state';
import { updateBadgeLabel, updateChips, updateSeverity, updateSummary } from './update-status';

function card(overrides: Partial<UpdateCard> = {}): UpdateCard {
  return {
    app: { id: 'app_stack', slug: 'stack', name: 'Stack', version: '1' },
    receipt: { appId: 'app_stack', name: 'Stack', version: '1', packageHash: 'old' },
    versionChanged: false,
    packageHashChanged: true,
    permissionsChanged: false,
    kindChanged: false,
    addedPermissions: [],
    removedPermissions: [],
    addedNetworkDomains: [],
    removedNetworkDomains: [],
    dataCompatibility: { status: 'same-schema', summary: 'Same data schema.' },
    latestSecurityScore: null,
    latestPrivacyGrade: null,
    containerEligibility: null,
    ...overrides,
  } as UpdateCard;
}

describe('update status', () => {
  test('treats package-only refreshes as quiet updates', () => {
    const c = card();

    expect(updateSeverity(c)).toBe('quiet');
    expect(updateSummary(c)).toBe('package refreshed');
    expect(updateChips(c).map((chip) => chip.label)).toContain('Same access');
  });

  test('marks version changes as review updates', () => {
    const c = card({ versionChanged: true, app: { id: 'app_stack', slug: 'stack', name: 'Stack', version: '2' } as never });

    expect(updateSeverity(c)).toBe('review');
    expect(updateSummary(c)).toContain('v1 to v2');
  });

  test('escalates new access or data changes to attention', () => {
    const c = card({
      addedNetworkDomains: ['api.example.com'],
      dataCompatibility: { status: 'family-match', summary: 'Compatible family, migration may run.' } as never,
    });

    expect(updateSeverity(c)).toBe('attention');
    expect(updateBadgeLabel([c, card()])).toBe('1 needs review');
    expect(updateChips(c).map((chip) => chip.tone)).toContain('attention');
  });
});
