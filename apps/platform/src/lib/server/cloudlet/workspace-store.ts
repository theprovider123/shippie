import type { WorkspaceEvent } from '@shippie/cloudlet-contract';

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

const WORKSPACE_SCHEMA_VERSION = 1;

export class WorkspaceStore {
  constructor(private sql: SqlExecutor) {}

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
      this.sql.run(`INSERT INTO workspace_schema_version (version) VALUES (?)`, WORKSPACE_SCHEMA_VERSION);
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
  appendEvent(e: WorkspaceEvent, receivedAt: number): { accepted: boolean } {
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
    return { accepted: true };
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
}
