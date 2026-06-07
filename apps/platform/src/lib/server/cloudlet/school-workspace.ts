/**
 * SchoolWorkspace — the per-school private workspace Durable Object.
 *
 * Each provisioned Uniti school instance gets its OWN SchoolWorkspace DO,
 * keyed by `idFromName(`uniti:${instanceId}`)` (the immutable instance id —
 * NEVER the mutable slug). The DO owns an embedded SQLite database that
 * holds that school's append-only event log + workspace audit. This is the
 * data boundary: one school's DO can never see another's data.
 *
 * The SQLite logic itself lives in the runtime-free `WorkspaceStore` (so it
 * is unit-testable in Node); this class is the thin DO wrapper that binds
 * the DO's `ctx.storage.sql` to the `SqlExecutor` interface and exposes RPC
 * methods callable through the DO stub.
 *
 * Following the repo convention (see `proximity/signal-room.ts`) we do NOT
 * import from `cloudflare:workers` at compile time — the class shape matches
 * the runtime DurableObject contract `(ctx, env)` and the `@cloudflare/
 * workers-types` `DurableObjectState` gives us the typed `storage.sql`.
 */
import type { DurableObjectState } from '@cloudflare/workers-types';
import { WorkspaceStore, type SqlExecutor } from './workspace-store';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

export class SchoolWorkspace {
  private store: WorkspaceStore;

  constructor(ctx: DurableObjectState, _env: unknown) {
    const sql = ctx.storage.sql; // DO embedded SQLite
    const exec: SqlExecutor = {
      run: (q: string, ...a: unknown[]) => {
        sql.exec(q, ...a);
      },
      all: <T>(q: string, ...a: unknown[]) => sql.exec(q, ...a).toArray() as T[],
    };
    this.store = new WorkspaceStore(exec);
    this.store.init();
  }

  // RPC methods — callable via the DO stub.

  /** Append one event. `Date.now()` is the SERVER/DO receipt time. */
  async appendEvent(e: WorkspaceEvent) {
    return this.store.appendEvent(e, Date.now());
  }

  async listEvents() {
    return this.store.listEvents();
  }

  async listAudit() {
    return this.store.listAudit();
  }

  async schemaVersion() {
    return this.store.schemaVersion();
  }

  // ── Teacher domain RPC (Phase 3) ─────────────────────────────────────────

  /** Load the prototype demo data so a provisioned school is demoable. */
  async seedDemoSchool() {
    this.store.seedDemoSchool(Date.now());
    return { seeded: true };
  }

  async listSubjects() {
    return this.store.listSubjects();
  }

  async listClasses() {
    return this.store.listClasses();
  }

  async listPupils() {
    return this.store.listPupils();
  }

  async listPupilsForClass(classId: string) {
    return this.store.listPupilsForClass(classId);
  }

  async listLessons() {
    return this.store.listLessons();
  }

  async getLesson(lessonId: string) {
    return this.store.getLesson(lessonId);
  }

  async listFeedbackForLesson(lessonId: string) {
    return this.store.listFeedbackForLesson(lessonId);
  }

  async listFeedbackForPupil(pupilId: string) {
    return this.store.listFeedbackForPupil(pupilId);
  }

  async listAdaptationCards() {
    return this.store.listAdaptationCards();
  }

  /** The school's AI ON/OFF + sensitivity (from setup) — read by the Broker. */
  async getAiSetting() {
    return this.store.getAiSetting();
  }
}
