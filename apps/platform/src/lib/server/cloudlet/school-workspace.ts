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
 * UNLIKE `proximity/signal-room.ts` (which exposes a single `fetch()` handler),
 * this DO exposes typed RPC METHODS callable through the stub
 * (`stub.listLessons()` …). The Workers runtime only enables DO RPC when the
 * class `extends DurableObject` (imported from `cloudflare:workers`) — without
 * it every stub method throws "does not support RPC". So we DO extend it here.
 */
import { DurableObject } from 'cloudflare:workers';
import type { DurableObjectState } from '@cloudflare/workers-types';
import { WorkspaceStore, type SqlExecutor } from './workspace-store';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

export class SchoolWorkspace extends DurableObject {
  private store: WorkspaceStore;

  constructor(ctx: DurableObjectState, env: unknown) {
    // `as never` — DurableObject's typed ctx/env (from cloudflare:workers)
    // differ slightly from @cloudflare/workers-types; identical at runtime.
    super(ctx as never, env as never);
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

  async listFeedbackForLesson(lessonId: string, opts?: { includeSafeguarding?: boolean }) {
    return this.store.listFeedbackForLesson(lessonId, opts);
  }

  async listFeedbackForPupil(pupilId: string, opts?: { includeSafeguarding?: boolean }) {
    return this.store.listFeedbackForPupil(pupilId, opts);
  }

  async listAdaptationCards() {
    return this.store.listAdaptationCards();
  }

  /** The school's AI ON/OFF + sensitivity (from setup) — read by the Broker. */
  async getAiSetting() {
    return this.store.getAiSetting();
  }

  // ── Roster / MIS (Phase 7) ───────────────────────────────────────────────

  /** Current roster (ALL pupils/classes incl. deactivated) — the diff baseline. */
  async rosterSnapshot() {
    return this.store.rosterSnapshot();
  }

  // ── Compliance + trust (Phase 9) ─────────────────────────────────────────

  /** Full per-school export (the school owns its data). Owner/school_admin gated
   * at the route — safeguarding note text INCLUDED (the school's own copy). */
  async buildExport() {
    return this.store.buildExport(Date.now());
  }

  /** The AI audit/eval signal lives in the control-plane audit_log; here we
   * surface the WORKSPACE audit (events, erasures, retention, roster imports). */
  async listTombstones() {
    return this.store.listTombstones();
  }

  async listSettings() {
    return this.store.listSettings();
  }

  /** Write a workspace setting (e.g. retention policy, AI on/off) via an event
   * is the canonical path; this direct setter exists for the retention cron. */
  async setSetting(key: string, value: string) {
    this.store.setSetting(key, value, Date.now());
    return { ok: true };
  }

  /** Right-to-erasure for one pupil — purge PII, keep anonymised aggregate. */
  async erasePupil(pupilId: string, reason?: string | null) {
    return this.store.erasePupil(pupilId, Date.now(), reason ?? null);
  }

  /** Purge the ENTIRE workspace SQLite (deprovision 'erase'). The caller then
   * deletes the DO storage entirely via ctx.storage. */
  async eraseAll() {
    const counts = this.store.eraseAll(Date.now());
    // Wipe ALL DO storage (the SQLite db + any KV) so nothing survives.
    await this.ctx.storage.deleteAll();
    return counts;
  }

  /** Apply the school's retention policy now (cron-callable, deterministic). */
  async applyRetention() {
    return this.store.applyRetention(Date.now());
  }
}
