import type { TextureName } from '../textures/types.ts';

export interface PatinaState {
  /** Wall-clock ms when this origin was first observed. */
  firstSeenAt: number;
  /** Wall-clock ms of the most recent session. */
  lastSeenAt: number;
  /** How many distinct app-open sessions. Used for milestone gating. */
  sessionCount: number;
  /** Milestones already fired so we don't repeat. */
  milestonesFired: TextureName[];
}

export interface PatinaConfig {
  /** Master switch. Default true. */
  enabled: boolean;
  /** 0 = no patina, 1 = strong. Default 0.3 (subtle). */
  sensitivity: number;
}

export const DEFAULT_PATINA_CONFIG: PatinaConfig = {
  enabled: true,
  sensitivity: 0.3,
};
