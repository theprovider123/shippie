import type { GroupLetter, RoundId } from "../data/tournament";

export const SCHEMA_VERSION = 1;

/** A user's (or friend's) full World Cup call. */
export interface Prediction {
  v: number;
  /** Per group: ordered team ids [1st, 2nd, 3rd, 4th]. */
  groups: Partial<Record<GroupLetter, string[]>>;
  /** slotId ("R32-0" … "F-0") -> team id the user says wins that match. */
  knockout: Record<string, string>;
  /** Fun bonus: nation of the Golden Boot winner. */
  topScorer?: string;
  /** Your Outside Bet — a contrarian nation you back to go further than the odds. */
  outsideBet?: string;
  createdAt: number;
}

/** Identity stored on-device. No account, no server. */
export interface Profile {
  name: string;
  favTeam?: string;
  /** Stable random id so a person can recognise their own entry in a pool. */
  uid: string;
  /** IANA timezone (or "auto") the viewer is watching from. */
  watchZone?: string;
  /** Explicit consent for publishing arcade scores to the worldwide board. */
  globalLeaderboardOptIn?: boolean;
}

/** A shared bracket received from a friend (decoded from a link). */
export interface PoolEntry {
  uid: string;
  name: string;
  favTeam?: string;
  prediction: Prediction;
  /** When this entry was imported locally. */
  importedAt: number;
}

/** A private pool: just a name + the brackets you've collected. No backend. */
export interface Pool {
  code: string;
  name: string;
  createdAt: number;
  entries: PoolEntry[];
}

/** Official results — same shape as a prediction, filled in as the cup unfolds. */
export interface Results {
  groups: Partial<Record<GroupLetter, string[]>>;
  knockout: Record<string, string>;
  topScorer?: string;
}

export interface ScoreBreakdown {
  groupPoints: number;
  knockoutPoints: Record<RoundId, number>;
  championBonus: number;
  total: number;
  /** Count of correct knockout calls, for "you nailed N of M" flexing. */
  correctCalls: number;
}
