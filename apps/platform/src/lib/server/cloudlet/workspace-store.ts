import type {
  UpcasterRegistry,
  WorkspaceEvent,
  RosterSnapshot,
} from '@shippie/cloudlet-contract';
import {
  workspaceUpcasters,
  WORKSPACE_EVENT_SCHEMA_VERSION,
} from './upcasters';
import {
  DEMO_SUBJECTS,
  DEMO_CLASSES,
  DEMO_PUPILS,
  DEMO_LESSONS,
  DEMO_FEEDBACK,
  DEMO_NOTES,
  DEMO_ADAPTATION_CARDS,
} from './demo-data';

/**
 * WorkspaceStore — the per-school workspace's append-only event log + audit,
 * isolated from the Durable Object runtime so it's unit-testable in Node.
 *
 * The DO (`school-workspace.ts`) binds its embedded SQLite to this
 * `SqlExecutor` interface; the test binds an in-memory `node:sqlite`. The
 * store is pure & deterministic: the SERVER receipt time (`receivedAt`) is
 * injected by the caller (the DO passes `Date.now()`), kept strictly
 * separate from the client's `createdOfflineAt`.
 */
export interface SqlExecutor {
  run(sql: string, ...args: unknown[]): void;
  all<T>(sql: string, ...args: unknown[]): T[];
}

export interface WorkspaceAudit {
  id: number;
  action: string;
  detail: string;
  at: number;
}

export interface SubjectRow {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
}
export interface ClassRow {
  id: string;
  name: string;
  yearGroup: string;
  room: string;
  /** 0 = deactivated (leaver/closed class — tombstoned, never deleted). */
  active: number;
}
export interface PupilRow {
  id: string;
  name: string;
  initials: string;
  send: number;
  eal: number;
  fsm: number;
  /** 0 = deactivated (leaver — tombstoned, never deleted; feedback survives). */
  active: number;
}
export interface LessonRow {
  id: string;
  classId: string;
  subjectId: string;
  topic: string;
  objective: string;
  time: string;
  status: string;
}
export interface FeedbackRow {
  lessonId: string;
  pupilId: string;
  state: string;
  note: string | null;
  supportStrategy: string | null;
  confidence: number | null;
  updatedAt: number;
}
export interface FeedbackTimelineRow extends FeedbackRow {
  topic: string;
  objective: string;
  subjectId: string;
  time: string;
}
export interface AdaptationCardRow {
  id: string;
  lessonId: string | null;
  subjectId: string;
  objective: string;
  typeLabel: string;
  emoji: string;
  target: string;
  need: string;
  teacherAction: string;
  why: string;
  evidence: string;
  confidence: number;
  reviewState: string;
  outcome: string | null;
  outcomeNote: string | null;
}

const WORKSPACE_SCHEMA_VERSION = 4;

export class WorkspaceStore {
  /**
   * @param sql the embedded SQLite executor (DO storage, or node:sqlite in tests)
   * @param upcasters event schema-version upcaster registry (Phase 4) — a
   *   replayed event stamped with an older `schemaVersion` is upgraded to the
   *   current version BEFORE projection, so old offline events still apply.
   *   Injectable for tests; defaults to the canonical server registry.
   * @param eventSchemaVersion the version every event is upcast to.
   */
  constructor(
    private sql: SqlExecutor,
    private upcasters: UpcasterRegistry = workspaceUpcasters,
    private eventSchemaVersion: number = WORKSPACE_EVENT_SCHEMA_VERSION,
  ) {}

  init(): void {
    // events: created_offline_at = CLIENT event time; received_at = SERVER
    // receipt time (kept separate — amendment #4).
    this.sql.run(`CREATE TABLE IF NOT EXISTS events (
      client_event_id TEXT PRIMARY KEY, type TEXT NOT NULL, instance_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL, device_id TEXT NOT NULL, created_offline_at TEXT NOT NULL,
      received_at INTEGER NOT NULL, schema_version INTEGER NOT NULL, payload TEXT NOT NULL, seq INTEGER NOT NULL)`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS workspace_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)`);
    // workspace_schema_version: clean migration path across hundreds of
    // school workspaces (amendment #3).
    this.sql.run(`CREATE TABLE IF NOT EXISTS workspace_schema_version (version INTEGER NOT NULL)`);
    if (
      (this.sql.all<{ n: number }>(`SELECT COUNT(*) AS n FROM workspace_schema_version`)[0]?.n ?? 0) === 0
    ) {
      this.sql.run(`INSERT INTO workspace_schema_version (version) VALUES (?)`, 1);
    }
    // Run forward migrations to the current version. Each migration is
    // idempotent (CREATE TABLE IF NOT EXISTS) so a re-init across hundreds of
    // school workspaces is safe (amendment #3 — clean migration path).
    this.migrate();
  }

  /** Bring the workspace schema up to WORKSPACE_SCHEMA_VERSION. */
  private migrate(): void {
    let v = this.schemaVersion();
    if (v < 2) {
      this.migrateToV2();
      v = 2;
    }
    if (v < 3) {
      this.migrateToV3();
      v = 3;
    }
    if (v < 4) {
      this.migrateToV4();
      v = 4;
    }
    this.sql.run(`UPDATE workspace_schema_version SET version = ?`, v);
  }

  /** v2 — the teacher product domain (classes, pupils, lessons, feedback,
   * adaptation cards). Feedback + adaptation OUTCOMES are projections of the
   * append-only event log; the log stays the source of truth. */
  private migrateToV2(): void {
    this.sql.run(`CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, color TEXT NOT NULL)`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, year_group TEXT NOT NULL, room TEXT NOT NULL)`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS pupils (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL,
      send INTEGER NOT NULL DEFAULT 0, eal INTEGER NOT NULL DEFAULT 0, fsm INTEGER NOT NULL DEFAULT 0)`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS class_pupils (
      class_id TEXT NOT NULL, pupil_id TEXT NOT NULL, PRIMARY KEY (class_id, pupil_id))`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY, class_id TEXT NOT NULL, subject_id TEXT NOT NULL,
      topic TEXT NOT NULL, objective TEXT NOT NULL, time TEXT NOT NULL, status TEXT NOT NULL)`);
    // feedback projection: last-write-wins per (lesson, pupil).
    this.sql.run(`CREATE TABLE IF NOT EXISTS feedback (
      lesson_id TEXT NOT NULL, pupil_id TEXT NOT NULL, state TEXT NOT NULL,
      note TEXT, support_strategy TEXT, confidence INTEGER, updated_at INTEGER NOT NULL,
      PRIMARY KEY (lesson_id, pupil_id))`);
    this.sql.run(`CREATE TABLE IF NOT EXISTS adaptation_cards (
      id TEXT PRIMARY KEY, lesson_id TEXT, subject_id TEXT NOT NULL, objective TEXT NOT NULL,
      type_label TEXT NOT NULL, emoji TEXT NOT NULL, target TEXT NOT NULL, need TEXT NOT NULL,
      teacher_action TEXT NOT NULL, why TEXT NOT NULL, evidence TEXT NOT NULL,
      confidence INTEGER NOT NULL, review_state TEXT NOT NULL, outcome TEXT, outcome_note TEXT)`);
  }

  /** v3 — per-school workspace settings (the privacy/AI choice from setup).
   * A key-value projection of the `setup.privacy_saved` event so the AIBroker
   * can read the school's AI ON/OFF without re-scanning the event log. */
  private migrateToV3(): void {
    this.sql.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
  }

  /** v4 — MIS / roster sync (Phase 7). Pupils + classes gain an `active` flag:
   * a leaver / closed class is DEACTIVATED (active=0), NEVER hard-deleted, so a
   * deactivated pupil's historic feedback still resolves (the feedback
   * projection joins lessons, not pupils). `INSERT OR IGNORE` on a fresh DB has
   * no rows; for an in-place upgrade `ALTER TABLE … ADD COLUMN` backfills 1. */
  private migrateToV4(): void {
    for (const table of ['pupils', 'classes']) {
      // node:sqlite + DO SQLite both lack "ADD COLUMN IF NOT EXISTS"; probe the
      // table_info and only add when missing so re-init is idempotent.
      const cols = this.sql.all<{ name: string }>(`PRAGMA table_info(${table})`);
      if (!cols.some((c) => c.name === 'active')) {
        this.sql.run(`ALTER TABLE ${table} ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
      }
    }
  }

  schemaVersion(): number {
    return (
      this.sql.all<{ version: number }>(`SELECT version FROM workspace_schema_version LIMIT 1`)[0]
        ?.version ?? 0
    );
  }

  /**
   * Append one event. `receivedAt` is the SERVER/DO receipt time (the DO
   * passes `Date.now()`); NEVER derived from the client's `createdOfflineAt`.
   * De-dupes by `clientEventId` (the table PK), so re-posting is a no-op.
   */
  appendEvent(raw: WorkspaceEvent, receivedAt: number): { accepted: boolean } {
    // Upcast a (possibly stale-schema) replayed event to the current version
    // BEFORE store + project, so old offline events always apply with the
    // current payload shape (Phase 4 — schema-version upcasters). `upcast` is
    // a no-op for events already at the target version.
    const e = this.upcasters.upcast(raw, this.eventSchemaVersion);
    const existing = this.sql.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM events WHERE client_event_id = ?`,
      e.clientEventId,
    );
    if ((existing[0]?.n ?? 0) > 0) return { accepted: false }; // dedupe by clientEventId
    const seq =
      (this.sql.all<{ m: number }>(`SELECT COALESCE(MAX(seq),0) AS m FROM events`)[0]?.m ?? 0) + 1;
    this.sql.run(
      `INSERT INTO events (client_event_id,type,instance_id,actor_user_id,device_id,created_offline_at,received_at,schema_version,payload,seq)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      e.clientEventId,
      e.type,
      e.instanceId,
      e.actorUserId,
      e.deviceId,
      e.createdOfflineAt,
      receivedAt,
      e.schemaVersion,
      JSON.stringify(e.payload),
      seq,
    );
    this.sql.run(
      `INSERT INTO workspace_audit (action,detail,at) VALUES (?,?,?)`,
      'event.appended',
      `${e.type}:${e.clientEventId}`,
      receivedAt,
    );
    this.project(e, receivedAt);
    return { accepted: true };
  }

  /**
   * Fold a freshly-appended event into the read-model projections. The event
   * log remains the source of truth — projections are derived and can always
   * be rebuilt. Unknown event types are ignored (no projection).
   */
  private project(e: WorkspaceEvent, receivedAt: number): void {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === 'feedback.created') {
      const lessonId = p.lessonId as string | undefined;
      const pupilId = p.pupilId as string | undefined;
      const state = p.state as string | undefined;
      if (!lessonId || !pupilId || !state) return;
      this.sql.run(
        `INSERT INTO feedback (lesson_id,pupil_id,state,note,support_strategy,confidence,updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(lesson_id,pupil_id) DO UPDATE SET
           state=excluded.state, note=excluded.note, support_strategy=excluded.support_strategy,
           confidence=excluded.confidence, updated_at=excluded.updated_at
         WHERE excluded.updated_at >= feedback.updated_at`,
        lessonId,
        pupilId,
        state,
        (p.note as string) ?? null,
        (p.supportStrategy as string) ?? null,
        typeof p.confidence === 'number' ? p.confidence : null,
        receivedAt,
      );
    } else if (e.type === 'setup.privacy_saved') {
      // The school's privacy/AI choice (from setup, Phase 2). Last-write-wins.
      const aiEnabled = p.aiEnabled === true || p.aiEnabled === 1;
      const sensitivity = typeof p.sensitivity === 'string' ? p.sensitivity : 'pseudonymised';
      this.setSetting('ai_enabled', aiEnabled ? '1' : '0', receivedAt);
      this.setSetting('ai_sensitivity', sensitivity, receivedAt);
    } else if (e.type === 'adaptation.review_state_set') {
      // Teacher accept/edit/reject of a suggested card (Phase 5 — human-owned).
      const cardId = p.cardId as string | undefined;
      const reviewState = p.reviewState as string | undefined;
      if (!cardId || !reviewState) return;
      this.sql.run(`UPDATE adaptation_cards SET review_state=? WHERE id=?`, reviewState, cardId);
    } else if (e.type === 'adaptation.generated') {
      // Phase 5 — the adaptation engine (rules or broker path) emits the
      // structured cards through the SAME append-only log. Project each into
      // the read-model. Idempotent on card id (INSERT OR IGNORE) so a replay
      // of the generation event doesn't duplicate cards.
      const cards = Array.isArray(p.cards) ? (p.cards as Array<Record<string, unknown>>) : [];
      for (const c of cards) {
        const target = (c.target ?? {}) as { ids?: unknown; label?: unknown };
        const ids = Array.isArray(target.ids) ? (target.ids as string[]) : [];
        const evidence = Array.isArray(c.evidence)
          ? (c.evidence as Array<{ note?: string }>)
              .map((ev) => ev?.note)
              .filter(Boolean)
              .join(' · ')
          : '';
        // Contract confidence is 'emerging'|'established'; the row stores a
        // numeric % for the prototype UI — map to a representative value.
        const confidencePct = c.confidence === 'established' ? 80 : 55;
        this.sql.run(
          `INSERT OR IGNORE INTO adaptation_cards
           (id,lesson_id,subject_id,objective,type_label,emoji,target,need,teacher_action,why,evidence,confidence,review_state,outcome,outcome_note)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          String(c.id ?? `card-${Date.now()}`),
          (c.lessonId as string) ?? null,
          (c.subjectId as string) ?? '',
          (c.objective as string) ?? '',
          (c.source as string) === 'broker' ? 'AI suggestion' : 'Suggested',
          '✨',
          String(target.label ?? `${ids.length} pupils`),
          (c.need as string) ?? '',
          (c.teacherAction as string) ?? '',
          (c.whyThis as string) ?? '',
          evidence,
          confidencePct,
          'planned',
          null,
          null,
        );
      }
    } else if (e.type === 'adaptation.outcome_recorded') {
      const cardId = p.cardId as string | undefined;
      const outcome = p.outcome as string | undefined;
      if (!cardId || !outcome) return;
      this.sql.run(
        `UPDATE adaptation_cards SET outcome=?, outcome_note=?, review_state='done' WHERE id=?`,
        outcome,
        (p.note as string) ?? null,
        cardId,
      );
    } else if (e.type === 'roster.imported') {
      // Phase 7 — apply an MIS/CSV roster import. The payload carries the
      // PRE-COMPUTED diff (adds/updates/deactivations/reactivations/memberships)
      // so the apply is deterministic + replayable from the log. Server/MIS
      // WINS for roster; leavers DEACTIVATE (active=0), NEVER delete — historic
      // feedback survives because the feedback projection joins lessons, not
      // pupils. Each sub-op is idempotent so a replayed import is a no-op.
      this.applyRosterDiffPayload(p, receivedAt);
    }
  }

  /** Apply the diff carried by a `roster.imported` event. Pure SQL projection
   * of a precomputed diff (see `computeRosterDiff` in the contract). */
  private applyRosterDiffPayload(p: Record<string, unknown>, receivedAt: number): void {
    const source = typeof p.source === 'string' ? p.source : 'unknown';
    const diff = (p.diff ?? {}) as {
      pupils?: {
        adds?: Array<Record<string, unknown>>;
        updates?: Array<{ sourceId: string; changes?: Array<{ field: string; to: unknown }> }>;
        deactivations?: Array<{ id: string }>;
        reactivations?: Array<{ id: string }>;
      };
      classes?: {
        adds?: Array<Record<string, unknown>>;
        updates?: Array<{ sourceId: string; changes?: Array<{ field: string; to: unknown }> }>;
        deactivations?: Array<{ id: string }>;
        reactivations?: Array<{ id: string }>;
      };
      memberships?: {
        adds?: Array<{ classSourceId: string; pupilSourceId: string }>;
        removes?: Array<{ classSourceId: string; pupilSourceId: string }>;
      };
    };

    const b = (v: unknown): number => (v === true || v === 1 || v === '1' ? 1 : 0);

    // ── Classes ──
    for (const c of diff.classes?.adds ?? []) {
      this.sql.run(
        `INSERT OR IGNORE INTO classes (id,name,year_group,room,active) VALUES (?,?,?,?,1)`,
        String(c.sourceId),
        String(c.name ?? ''),
        String(c.yearGroup ?? ''),
        String(c.room ?? ''),
      );
      // an add of an existing-but-deactivated class also reactivates it.
      this.sql.run(`UPDATE classes SET active=1 WHERE id=?`, String(c.sourceId));
    }
    for (const u of diff.classes?.updates ?? []) {
      for (const ch of u.changes ?? []) {
        const col = ch.field === 'yearGroup' ? 'year_group' : ch.field;
        if (col !== 'name' && col !== 'year_group' && col !== 'room') continue;
        this.sql.run(`UPDATE classes SET ${col}=? WHERE id=?`, String(ch.to ?? ''), u.sourceId);
      }
    }
    for (const d of diff.classes?.deactivations ?? [])
      this.sql.run(`UPDATE classes SET active=0 WHERE id=?`, d.id);
    for (const re of diff.classes?.reactivations ?? [])
      this.sql.run(`UPDATE classes SET active=1 WHERE id=?`, re.id);

    // ── Pupils ──
    for (const pu of diff.pupils?.adds ?? []) {
      this.sql.run(
        `INSERT OR IGNORE INTO pupils (id,name,initials,send,eal,fsm,active) VALUES (?,?,?,?,?,?,1)`,
        String(pu.sourceId),
        String(pu.name ?? ''),
        String(pu.initials ?? ''),
        b(pu.send),
        b(pu.eal),
        b(pu.fsm),
      );
      this.sql.run(`UPDATE pupils SET active=1 WHERE id=?`, String(pu.sourceId));
    }
    for (const u of diff.pupils?.updates ?? []) {
      for (const ch of u.changes ?? []) {
        if (ch.field === 'name')
          this.sql.run(`UPDATE pupils SET name=? WHERE id=?`, String(ch.to ?? ''), u.sourceId);
        else if (ch.field === 'send' || ch.field === 'eal' || ch.field === 'fsm')
          this.sql.run(`UPDATE pupils SET ${ch.field}=? WHERE id=?`, b(ch.to), u.sourceId);
      }
    }
    // DEACTIVATE leavers — NEVER delete. Feedback survives the tombstone.
    for (const d of diff.pupils?.deactivations ?? [])
      this.sql.run(`UPDATE pupils SET active=0 WHERE id=?`, d.id);
    for (const re of diff.pupils?.reactivations ?? [])
      this.sql.run(`UPDATE pupils SET active=1 WHERE id=?`, re.id);

    // ── Memberships ──
    for (const m of diff.memberships?.adds ?? [])
      this.sql.run(
        `INSERT OR IGNORE INTO class_pupils (class_id,pupil_id) VALUES (?,?)`,
        m.classSourceId,
        m.pupilSourceId,
      );
    // A removed membership is dropped from the projection (the EDGE, not the
    // pupil) — the pupil row + their feedback are untouched.
    for (const m of diff.memberships?.removes ?? [])
      this.sql.run(
        `DELETE FROM class_pupils WHERE class_id=? AND pupil_id=?`,
        m.classSourceId,
        m.pupilSourceId,
      );

    this.sql.run(
      `INSERT INTO workspace_audit (action,detail,at) VALUES (?,?,?)`,
      'roster.imported',
      `source=${source} +${(diff.pupils?.adds ?? []).length}p ~${(diff.pupils?.updates ?? []).length}p -${(diff.pupils?.deactivations ?? []).length}p`,
      receivedAt,
    );
  }

  /** The current roster as the diff baseline (ALL pupils/classes incl.
   * deactivated, so a reactivation is detectable). Pure read. */
  rosterSnapshot(): RosterSnapshot {
    const pupils = this.sql
      .all<{ id: string; name: string; send: number; eal: number; fsm: number; active: number }>(
        `SELECT id,name,send,eal,fsm,active FROM pupils ORDER BY rowid ASC`,
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        send: p.send === 1,
        eal: p.eal === 1,
        fsm: p.fsm === 1,
        active: p.active === 1,
      }));
    const classes = this.sql
      .all<{ id: string; name: string; year_group: string; room: string; active: number }>(
        `SELECT id,name,year_group,room,active FROM classes ORDER BY rowid ASC`,
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        yearGroup: c.year_group,
        room: c.room,
        active: c.active === 1,
      }));
    const memberships = this.sql
      .all<{ class_id: string; pupil_id: string }>(`SELECT class_id,pupil_id FROM class_pupils`)
      .map((m) => ({ classId: m.class_id, pupilId: m.pupil_id }));
    return { pupils, classes, memberships };
  }

  listEvents(): Array<WorkspaceEvent & { receivedAt: number }> {
    return this.sql
      .all<{
        client_event_id: string;
        type: string;
        instance_id: string;
        actor_user_id: string;
        device_id: string;
        created_offline_at: string;
        received_at: number;
        schema_version: number;
        payload: string;
      }>(`SELECT * FROM events ORDER BY seq ASC`)
      .map((r) => ({
        clientEventId: r.client_event_id,
        type: r.type,
        instanceId: r.instance_id,
        actorUserId: r.actor_user_id,
        deviceId: r.device_id,
        createdOfflineAt: r.created_offline_at,
        receivedAt: r.received_at,
        schemaVersion: r.schema_version,
        payload: JSON.parse(r.payload),
      }));
  }

  listAudit(): WorkspaceAudit[] {
    return this.sql.all<WorkspaceAudit>(`SELECT * FROM workspace_audit ORDER BY id ASC`);
  }

  // ── Teacher domain reads (v2) ────────────────────────────────────────────

  listSubjects(): SubjectRow[] {
    return this.sql
      .all<{ id: string; name: string; parent_id: string | null; color: string }>(
        `SELECT * FROM subjects ORDER BY rowid ASC`,
      )
      .map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, color: r.color }));
  }

  /** Active classes (the teacher view). Deactivated/tombstoned classes are
   * excluded here but never deleted — see {@link rosterSnapshot}. */
  listClasses(): ClassRow[] {
    return this.sql
      .all<{ id: string; name: string; year_group: string; room: string; active: number }>(
        `SELECT * FROM classes WHERE active = 1 ORDER BY rowid ASC`,
      )
      .map((r) => ({ id: r.id, name: r.name, yearGroup: r.year_group, room: r.room, active: r.active }));
  }

  /** Active pupils only (the teacher view). A deactivated leaver is tombstoned,
   * not deleted, so their feedback still resolves. */
  listPupils(): PupilRow[] {
    return this.sql.all<PupilRow>(`SELECT * FROM pupils WHERE active = 1 ORDER BY rowid ASC`);
  }

  listPupilsForClass(classId: string): PupilRow[] {
    return this.sql.all<PupilRow>(
      `SELECT p.* FROM pupils p JOIN class_pupils cp ON cp.pupil_id = p.id
       WHERE cp.class_id = ? AND p.active = 1 ORDER BY p.rowid ASC`,
      classId,
    );
  }

  listLessons(): LessonRow[] {
    return this.sql
      .all<{
        id: string;
        class_id: string;
        subject_id: string;
        topic: string;
        objective: string;
        time: string;
        status: string;
      }>(`SELECT * FROM lessons ORDER BY rowid ASC`)
      .map((r) => ({
        id: r.id,
        classId: r.class_id,
        subjectId: r.subject_id,
        topic: r.topic,
        objective: r.objective,
        time: r.time,
        status: r.status,
      }));
  }

  getLesson(lessonId: string): LessonRow | null {
    return this.listLessons().find((l) => l.id === lessonId) ?? null;
  }

  private mapFeedback(r: {
    lesson_id: string;
    pupil_id: string;
    state: string;
    note: string | null;
    support_strategy: string | null;
    confidence: number | null;
    updated_at: number;
  }): FeedbackRow {
    return {
      lessonId: r.lesson_id,
      pupilId: r.pupil_id,
      state: r.state,
      note: r.note,
      supportStrategy: r.support_strategy,
      confidence: r.confidence,
      updatedAt: r.updated_at,
    };
  }

  listFeedbackForLesson(lessonId: string): FeedbackRow[] {
    return this.sql
      .all<Parameters<WorkspaceStore['mapFeedback']>[0]>(
        `SELECT * FROM feedback WHERE lesson_id = ?`,
        lessonId,
      )
      .map((r) => this.mapFeedback(r));
  }

  /** A pupil's feedback over time, joined to lesson + subject for the timeline. */
  listFeedbackForPupil(pupilId: string): FeedbackTimelineRow[] {
    return this.sql
      .all<{
        lesson_id: string;
        pupil_id: string;
        state: string;
        note: string | null;
        support_strategy: string | null;
        confidence: number | null;
        updated_at: number;
        topic: string;
        objective: string;
        subject_id: string;
        time: string;
      }>(
        `SELECT f.*, l.topic, l.objective, l.subject_id, l.time
         FROM feedback f JOIN lessons l ON l.id = f.lesson_id
         WHERE f.pupil_id = ? ORDER BY f.updated_at ASC`,
        pupilId,
      )
      .map((r) => ({
        ...this.mapFeedback(r),
        topic: r.topic,
        objective: r.objective,
        subjectId: r.subject_id,
        time: r.time,
      }));
  }

  listAdaptationCards(): AdaptationCardRow[] {
    return this.sql
      .all<{
        id: string;
        lesson_id: string | null;
        subject_id: string;
        objective: string;
        type_label: string;
        emoji: string;
        target: string;
        need: string;
        teacher_action: string;
        why: string;
        evidence: string;
        confidence: number;
        review_state: string;
        outcome: string | null;
        outcome_note: string | null;
      }>(`SELECT * FROM adaptation_cards ORDER BY rowid ASC`)
      .map((r) => ({
        id: r.id,
        lessonId: r.lesson_id,
        subjectId: r.subject_id,
        objective: r.objective,
        typeLabel: r.type_label,
        emoji: r.emoji,
        target: r.target,
        need: r.need,
        teacherAction: r.teacher_action,
        why: r.why,
        evidence: r.evidence,
        confidence: r.confidence,
        reviewState: r.review_state,
        outcome: r.outcome,
        outcomeNote: r.outcome_note,
      }));
  }

  // ── Settings (v3) ────────────────────────────────────────────────────────

  setSetting(key: string, value: string, at: number): void {
    this.sql.run(
      `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      key,
      value,
      at,
    );
  }

  getSetting(key: string): string | null {
    return (
      this.sql.all<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)[0]?.value ??
      null
    );
  }

  /** The school's AI ON/OFF + sensitivity (from setup). Defaults: AI on,
   * pseudonymised — but the Broker always re-checks before any model call. */
  getAiSetting(): { aiEnabled: boolean; sensitivity: 'group' | 'pseudonymised' | 'identified' } {
    const ai = this.getSetting('ai_enabled');
    const sens = this.getSetting('ai_sensitivity');
    return {
      aiEnabled: ai === null ? true : ai === '1',
      sensitivity:
        sens === 'group' || sens === 'identified' ? sens : 'pseudonymised',
    };
  }

  /**
   * Load the prototype's demo data into a freshly provisioned workspace so a
   * school is immediately demoable without a real MIS sync. Idempotent:
   * `INSERT OR IGNORE` / no-op on re-run. Seeds the static roster + lessons +
   * adaptation cards directly, then folds the demo feedback through the SAME
   * append-only event log so the projection path is exercised on seed too.
   */
  seedDemoSchool(seededAt = 0): void {
    if (this.listPupils().length > 0) return; // already seeded — idempotent

    for (const s of DEMO_SUBJECTS) {
      this.sql.run(
        `INSERT OR IGNORE INTO subjects (id,name,parent_id,color) VALUES (?,?,?,?)`,
        s.id,
        s.name,
        s.parentId,
        s.color,
      );
    }
    for (const c of DEMO_CLASSES) {
      this.sql.run(
        `INSERT OR IGNORE INTO classes (id,name,year_group,room) VALUES (?,?,?,?)`,
        c.id,
        c.name,
        c.yearGroup,
        c.room,
      );
    }
    for (const p of DEMO_PUPILS) {
      this.sql.run(
        `INSERT OR IGNORE INTO pupils (id,name,initials,send,eal,fsm) VALUES (?,?,?,?,?,?)`,
        p.id,
        p.name,
        p.initials,
        p.send,
        p.eal,
        p.fsm,
      );
      // Demo: all 28 pupils belong to the Year 4 class (4M).
      this.sql.run(
        `INSERT OR IGNORE INTO class_pupils (class_id,pupil_id) VALUES (?,?)`,
        'c-4m',
        p.id,
      );
    }
    for (const l of DEMO_LESSONS) {
      this.sql.run(
        `INSERT OR IGNORE INTO lessons (id,class_id,subject_id,topic,objective,time,status) VALUES (?,?,?,?,?,?,?)`,
        l.id,
        l.classId,
        l.subjectId,
        l.topic,
        l.objective,
        l.time,
        l.status,
      );
    }
    for (const a of DEMO_ADAPTATION_CARDS) {
      this.sql.run(
        `INSERT OR IGNORE INTO adaptation_cards
         (id,lesson_id,subject_id,objective,type_label,emoji,target,need,teacher_action,why,evidence,confidence,review_state,outcome,outcome_note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        a.id,
        a.lessonId,
        a.subjectId,
        a.objective,
        a.typeLabel,
        a.emoji,
        a.target,
        a.need,
        a.teacherAction,
        a.why,
        a.evidence,
        a.confidence,
        a.reviewState,
        a.outcome,
        null,
      );
    }
    // Fold the demo feedback for the in-progress lesson through the event log.
    let i = 0;
    for (const [pupilId, state] of Object.entries(DEMO_FEEDBACK)) {
      this.appendEvent(
        {
          clientEventId: `seed-fb-l1-${pupilId}`,
          type: 'feedback.created',
          instanceId: 'seed',
          actorUserId: 'seed',
          deviceId: 'seed',
          createdOfflineAt: new Date(seededAt).toISOString(),
          schemaVersion: 1,
          payload: { lessonId: 'l1', pupilId, state, note: DEMO_NOTES[pupilId] ?? null },
        },
        seededAt + i++,
      );
    }
  }
}
