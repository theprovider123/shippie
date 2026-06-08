import { describe, expect, it } from 'bun:test';
import { DEFAULT_PREP } from './store.ts';
import { integrationGuide, prepareGuide } from './guide.ts';
import type { TripSession } from './types.ts';

describe('local guide panels', () => {
  it('keeps prepare guidance offline and away from dosage copy', () => {
    const guide = prepareGuide(
      {
        ...DEFAULT_PREP,
        intention: 'resting with grief',
        contact: { ...DEFAULT_PREP.contact, name: 'Maya' },
      },
      [],
    );
    const copy = Object.values(guide).join(' ').toLowerCase();

    expect(copy).toContain('resting with grief');
    expect(copy).not.toContain('dose');
    expect(copy).not.toContain('recommended');
  });

  it('turns check-ins into a simple integration prompt', () => {
    const session: TripSession = {
      id: 'trip_test',
      status: 'completed',
      startedAt: Date.now() - 1000,
      closedAt: Date.now(),
      prep: { ...DEFAULT_PREP, intention: 'move slowly' },
      moodLog: [
        { id: 'mood_one', felt: 'intense', phaseId: 'peak', elapsedMin: 90, createdAt: Date.now() },
        { id: 'mood_two', felt: 'hard', phaseId: 'peak', elapsedMin: 110, createdAt: Date.now() },
      ],
      journal: '',
      carryForward: '',
    };
    const guide = integrationGuide(session);

    expect(guide.reflectionPrompt).toContain('move slowly');
    expect(guide.patternNote).toContain('2 check-ins');
    expect(guide.patternNote).not.toContain('dose');
  });
});
