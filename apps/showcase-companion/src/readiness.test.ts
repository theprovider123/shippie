import { describe, expect, it } from 'bun:test';
import { DEFAULT_PREP } from './store.ts';
import { getPreparationGuidance, isReadyToStart } from './readiness.ts';

describe('companion readiness', () => {
  it('lets a session start even when setup is empty', () => {
    expect(isReadyToStart(DEFAULT_PREP)).toBe(true);
  });

  it('keeps missing setup as guidance, not blockers', () => {
    const guidance = getPreparationGuidance(DEFAULT_PREP);

    expect(guidance).toEqual([
      'Leave yourself an anchor note if you have a minute.',
      'Add a trusted person for one-tap help.',
      'Add your local emergency number for quick access.',
    ]);
  });

  it('does not require optional intention or timeline fields', () => {
    const prep = {
      ...DEFAULT_PREP,
      anchor: 'Lie down, breathe out, call Maya if needed.',
      contact: {
        name: 'Maya',
        phone: '+441234567890',
        emergencyNumber: '999',
      },
    };

    expect(isReadyToStart(prep)).toBe(true);
  });

  it('surfaces caution acknowledgement as guidance only', () => {
    const prep = {
      ...DEFAULT_PREP,
      anchor: 'Read this slowly.',
      contact: {
        name: 'Maya',
        phone: '+441234567890',
        emergencyNumber: '999',
      },
      safetyFlags: ['lithium' as const],
      safetyAcknowledged: false,
    };

    expect(getPreparationGuidance(prep)).toContain('Review the caution notes and involve real-world support.');
    expect(isReadyToStart(prep)).toBe(true);
    expect(isReadyToStart({ ...prep, safetyAcknowledged: true })).toBe(true);
  });
});
