import { describe, expect, it } from 'bun:test';
import { DEFAULT_PREP } from './store.ts';
import { createTripSession, replaceActiveSession, shellPresenceLevel } from './session.ts';
import type { PrepState, TripSession } from './types.ts';

function session(id: string, presenceLevel: TripSession['prep']['presenceLevel'], status: TripSession['status']): TripSession {
  return { ...createTripSession({ ...DEFAULT_PREP, presenceLevel }, id, 1000), status };
}

describe('companion session flow', () => {
  it('snapshots the selected prepare presence into a new session', () => {
    const prep: PrepState = {
      ...DEFAULT_PREP,
      presenceLevel: 'vivid',
      checklist: { ...DEFAULT_PREP.checklist, water: true },
      contact: { ...DEFAULT_PREP.contact, name: 'Maya' },
      safetyFlags: ['mixed'],
    };

    const next = createTripSession(prep, 'trip_test', 2000);

    expect(next.prep.presenceLevel).toBe('vivid');
    expect(next.prep.checklist.water).toBe(true);
    expect(next.prep.contact.name).toBe('Maya');
    expect(next.prep.safetyFlags).toEqual(['mixed']);

    prep.checklist.water = false;
    prep.contact.name = 'Changed';
    prep.safetyFlags.push('heart');

    expect(next.prep.checklist.water).toBe(true);
    expect(next.prep.contact.name).toBe('Maya');
    expect(next.prep.safetyFlags).toEqual(['mixed']);
  });

  it('replaces any unfinished active session when starting again', () => {
    const oldActive = session('trip_old', 'simple', 'active');
    const completed = session('trip_done', 'minimal', 'completed');
    const next = session('trip_next', 'vivid', 'active');

    expect(replaceActiveSession([oldActive, completed], next).map((item) => item.id)).toEqual([
      'trip_next',
      'trip_done',
    ]);
  });

  it('lets prepare mode show the prepare presence even while a session is active', () => {
    expect(
      shellPresenceLevel({
        mode: 'prepare',
        prep: { ...DEFAULT_PREP, presenceLevel: 'vivid' },
        activeSession: session('trip_active', 'simple', 'active'),
        latestSession: null,
      }),
    ).toBe('vivid');
  });

  it('keeps during mode tied to the active session presence', () => {
    expect(
      shellPresenceLevel({
        mode: 'during',
        prep: { ...DEFAULT_PREP, presenceLevel: 'vivid' },
        activeSession: session('trip_active', 'minimal', 'active'),
        latestSession: null,
      }),
    ).toBe('minimal');
  });

  it('keeps integration tied to the active or latest session presence', () => {
    expect(
      shellPresenceLevel({
        mode: 'integrate',
        prep: { ...DEFAULT_PREP, presenceLevel: 'minimal' },
        activeSession: null,
        latestSession: session('trip_done', 'vivid', 'completed'),
      }),
    ).toBe('vivid');
  });
});
