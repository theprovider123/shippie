/**
 * The DO RPC surface shared by the cloudlet workspace routes. Mirrors the
 * public methods on `SchoolWorkspace` (school-workspace.ts). Kept in one place
 * so every route casts the DO stub to the SAME contract.
 */
import type { WorkspaceEvent, RosterSnapshot } from '@shippie/cloudlet-contract';
import type {
  SubjectRow,
  ClassRow,
  PupilRow,
  LessonRow,
  FeedbackRow,
  FeedbackTimelineRow,
  AdaptationCardRow,
  WorkspaceExport,
  PupilTombstone,
} from './workspace-store';

export interface WorkspaceStub {
  appendEvent: (e: WorkspaceEvent) => Promise<{ accepted: boolean }>;
  listEvents: () => Promise<Array<WorkspaceEvent & { receivedAt: number }>>;
  seedDemoSchool: () => Promise<{ seeded: boolean }>;
  listSubjects: () => Promise<SubjectRow[]>;
  listClasses: () => Promise<ClassRow[]>;
  listPupils: () => Promise<PupilRow[]>;
  listPupilsForClass: (classId: string) => Promise<PupilRow[]>;
  listLessons: () => Promise<LessonRow[]>;
  getLesson: (lessonId: string) => Promise<LessonRow | null>;
  listFeedbackForLesson: (
    lessonId: string,
    opts?: { includeSafeguarding?: boolean },
  ) => Promise<FeedbackRow[]>;
  listFeedbackForPupil: (
    pupilId: string,
    opts?: { includeSafeguarding?: boolean },
  ) => Promise<FeedbackTimelineRow[]>;
  listAdaptationCards: () => Promise<AdaptationCardRow[]>;
  getAiSetting: () => Promise<{
    aiEnabled: boolean;
    sensitivity: 'group' | 'pseudonymised' | 'identified';
  }>;
  rosterSnapshot: () => Promise<RosterSnapshot>;
  // ── Compliance + trust (Phase 9) ───────────────────────────────────────────
  buildExport: () => Promise<WorkspaceExport>;
  listTombstones: () => Promise<PupilTombstone[]>;
  listSettings: () => Promise<Array<{ key: string; value: string; updatedAt: number }>>;
  setSetting: (key: string, value: string) => Promise<{ ok: boolean }>;
  erasePupil: (
    pupilId: string,
    reason?: string | null,
  ) => Promise<{ notesPurged: number; membershipsRemoved: number; alreadyErased: boolean }>;
  eraseAll: () => Promise<{ events: number; feedback: number; pupils: number }>;
  applyRetention: () => Promise<{ notesPurged: number; cutoff: number | null }>;
}
