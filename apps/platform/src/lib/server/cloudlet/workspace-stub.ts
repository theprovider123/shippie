/**
 * The DO RPC surface shared by the cloudlet workspace routes. Mirrors the
 * public methods on `SchoolWorkspace` (school-workspace.ts). Kept in one place
 * so every route casts the DO stub to the SAME contract.
 */
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';
import type {
  SubjectRow,
  ClassRow,
  PupilRow,
  LessonRow,
  FeedbackRow,
  FeedbackTimelineRow,
  AdaptationCardRow,
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
  listFeedbackForLesson: (lessonId: string) => Promise<FeedbackRow[]>;
  listFeedbackForPupil: (pupilId: string) => Promise<FeedbackTimelineRow[]>;
  listAdaptationCards: () => Promise<AdaptationCardRow[]>;
}
