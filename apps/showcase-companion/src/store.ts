import type { ChecklistKey, CompanionState, PresenceLevel, PrepState, TripSession } from './types.ts';

const STORAGE_KEY = 'shippie.companion.v1';

const checklist: Record<ChecklistKey, boolean> = {
  space: false,
  water: false,
  music: false,
  dnd: false,
  charged: false,
};

export const DEFAULT_PREP: PrepState = {
  presenceLevel: 'simple',
  checklist,
  intention: '',
  anchor: '',
  substance: 'psilocybin',
  amount: '',
  contact: {
    name: '',
    phone: '',
    emergencyNumber: '',
  },
  safetyFlags: [],
  safetyAcknowledged: false,
};

export function defaultState(): CompanionState {
  return {
    prep: {
      ...DEFAULT_PREP,
      checklist: { ...DEFAULT_PREP.checklist },
      contact: { ...DEFAULT_PREP.contact },
      safetyFlags: [...DEFAULT_PREP.safetyFlags],
    },
    sessions: [],
    safetyGate: {
      ageConfirmed: false,
      harmReductionAccepted: false,
      emergencyAccepted: false,
    },
  };
}

export function loadState(): CompanionState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<CompanionState>;
    return normalize(parsed);
  } catch {
    return defaultState();
  }
}

export function saveState(state: CompanionState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* local quota errors are non-fatal */
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type LegacyState = Partial<CompanionState> & {
  visualMode?: 'grounded' | 'kaleidoscope';
  motionMode?: 'full' | 'reduced';
  detailMode?: 'full' | 'simple';
};

function normalize(raw: LegacyState): CompanionState {
  const fallback = defaultState();
  const prep = raw.prep ?? fallback.prep;
  const presenceLevel = normalizePresence(prep.presenceLevel, raw.visualMode);
  return {
    prep: {
      ...fallback.prep,
      ...prep,
      presenceLevel,
      checklist: { ...fallback.prep.checklist, ...(prep.checklist ?? {}) },
      contact: { ...fallback.prep.contact, ...(prep.contact ?? {}) },
      safetyFlags: Array.isArray(prep.safetyFlags) ? prep.safetyFlags : [],
    },
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map((session) => normalizeSession(session, presenceLevel)) : [],
    safetyGate: {
      ageConfirmed: Boolean(raw.safetyGate?.ageConfirmed),
      harmReductionAccepted: Boolean(raw.safetyGate?.harmReductionAccepted),
      emergencyAccepted: Boolean(raw.safetyGate?.emergencyAccepted),
      completedAt: typeof raw.safetyGate?.completedAt === 'number' ? raw.safetyGate.completedAt : undefined,
    },
  };
}

function normalizeSession(session: TripSession, fallbackPresence: PresenceLevel): TripSession {
  return {
    ...session,
    prep: {
      ...DEFAULT_PREP,
      ...session.prep,
      presenceLevel: normalizePresence(session.prep?.presenceLevel, undefined, fallbackPresence),
      checklist: { ...DEFAULT_PREP.checklist, ...(session.prep?.checklist ?? {}) },
      contact: { ...DEFAULT_PREP.contact, ...(session.prep?.contact ?? {}) },
      safetyFlags: Array.isArray(session.prep?.safetyFlags) ? session.prep.safetyFlags : [],
    },
    moodLog: Array.isArray(session.moodLog) ? session.moodLog : [],
    journal: typeof session.journal === 'string' ? session.journal : '',
    carryForward: typeof session.carryForward === 'string' ? session.carryForward : '',
  };
}

export function normalizePresence(
  value: unknown,
  legacyVisualMode?: unknown,
  fallback: PresenceLevel = 'simple',
): PresenceLevel {
  if (value === 'minimal' || value === 'simple' || value === 'vivid') return value;
  if (legacyVisualMode === 'kaleidoscope') return 'vivid';
  return fallback;
}
