export const APP_NAME = 'Companion';

export type Mode = 'prepare' | 'during' | 'integrate' | 'history';
export type PresenceLevel = 'minimal' | 'simple' | 'vivid';
export type Substance = 'psilocybin' | 'lsd' | 'other';
export type FeltState = 'gentle' | 'intense' | 'hard';
export type SafetyFlag =
  | 'ssri-snri'
  | 'maoi'
  | 'lithium'
  | 'tramadol'
  | 'heart'
  | 'psychosis'
  | 'mixed';
export type ChecklistKey = 'space' | 'water' | 'music' | 'dnd' | 'charged';

export interface EmergencyContact {
  name: string;
  phone: string;
  emergencyNumber: string;
}

export interface PrepState {
  presenceLevel: PresenceLevel;
  checklist: Record<ChecklistKey, boolean>;
  intention: string;
  anchor: string;
  substance: Substance;
  amount: string;
  contact: EmergencyContact;
  safetyFlags: SafetyFlag[];
  safetyAcknowledged: boolean;
}

export interface SafetyGateState {
  ageConfirmed: boolean;
  harmReductionAccepted: boolean;
  emergencyAccepted: boolean;
  completedAt?: number;
}

export interface MoodLog {
  id: string;
  felt: FeltState;
  phaseId: string;
  elapsedMin: number;
  createdAt: number;
}

export interface TripSession {
  id: string;
  status: 'active' | 'completed';
  startedAt: number;
  closedAt?: number;
  prep: PrepState;
  moodLog: MoodLog[];
  journal: string;
  carryForward: string;
}

export interface CompanionState {
  prep: PrepState;
  sessions: TripSession[];
  safetyGate: SafetyGateState;
}
