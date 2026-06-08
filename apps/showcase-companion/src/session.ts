import type { Mode, PrepState, TripSession } from './types.ts';

export function clonePrep(prep: PrepState): PrepState {
  return {
    ...prep,
    checklist: { ...prep.checklist },
    contact: { ...prep.contact },
    safetyFlags: [...prep.safetyFlags],
  };
}

export function createTripSession(prep: PrepState, id: string, now = Date.now()): TripSession {
  return {
    id,
    status: 'active',
    startedAt: now,
    prep: clonePrep(prep),
    moodLog: [],
    journal: '',
    carryForward: '',
  };
}

export function replaceActiveSession(sessions: readonly TripSession[], nextSession: TripSession): TripSession[] {
  return [nextSession, ...sessions.filter((session) => session.status !== 'active')];
}

export function shellPresenceLevel({
  mode,
  prep,
  activeSession,
  latestSession,
}: {
  mode: Mode;
  prep: PrepState;
  activeSession: TripSession | null;
  latestSession: TripSession | null;
}): PrepState['presenceLevel'] {
  if (mode === 'during') return activeSession?.prep.presenceLevel ?? prep.presenceLevel;
  if (mode === 'integrate') return (activeSession ?? latestSession)?.prep.presenceLevel ?? prep.presenceLevel;
  return prep.presenceLevel;
}
