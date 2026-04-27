/**
 * In-memory signalling state for the Shippie Hub.
 *
 * Mirrors the semantics of the Cloudflare Worker's SignalRoom Durable
 * Object — a per-room list of connected WebSockets, fan-out on
 * receive, drop on disconnect. Strictly ephemeral; we keep nothing on
 * disk by design (the Hub is a relay, not a server-of-record).
 *
 * The optional SQLite backing exists only as a recovery layer if the
 * process restarts mid-session — it stores room ids + last-seen
 * timestamps, never message bodies.
 */

import { Database } from 'bun:sqlite';

export interface PeerSocket {
  /** Stable peer id supplied at hello-time. */
  peerId: string;
  /** The underlying WebSocket. We type-erase to keep this module
   *  portable between Bun.serve sockets and Node ws sockets. */
  send(data: string): void;
  /** Best-effort close. */
  close(): void;
}

export interface RoomStats {
  roomId: string;
  peerCount: number;
  lastActivityMs: number;
}

interface RoomEntry {
  peers: Map<string, PeerSocket>;
  lastActivityMs: number;
}

export class HubState {
  private rooms = new Map<string, RoomEntry>();
  private db?: Database;

  constructor(opts: { dbPath?: string } = {}) {
    if (opts.dbPath) {
      try {
        this.db = new Database(opts.dbPath);
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS room_audit (
            room_id TEXT PRIMARY KEY,
            last_active INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS analytics_beacons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at INTEGER NOT NULL,
            app_slug TEXT NOT NULL,
            period TEXT NOT NULL,
            session_hash TEXT NOT NULL,
            payload TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_beacons_app_period
            ON analytics_beacons (app_slug, period);
        `);
      } catch {
        // bun:sqlite missing or path unwritable — the Hub still runs.
        this.db = undefined;
      }
    }
  }

  /**
   * Phase 9.2 — record a privacy-first analytics beacon. The Hub stores
   * the raw allowlisted JSON. Aggregation queries (by period, by slug,
   * DAU via distinct sessionHash) live in the dashboard SQL.
   *
   * The Hub does not validate the schema — that's the wrapper SDK's
   * responsibility upstream. A malformed beacon is simply stored and
   * filtered out at query time.
   */
  recordBeacon(beacon: {
    appSlug: string;
    period: string;
    sessionHash: string;
    metrics: unknown;
  }): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT INTO analytics_beacons (received_at, app_slug, period, session_hash, payload)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(Date.now(), beacon.appSlug, beacon.period, beacon.sessionHash, JSON.stringify(beacon));
    } catch {
      // Storage hiccups must not break the beacon-receiving handler.
    }
  }

  /** DAU for an app on a given UTC date, by counting distinct session
   *  hashes. Used by the Hub dashboard. */
  dailyActiveDevices(appSlug: string, period: string): number {
    if (!this.db) return 0;
    try {
      const row = this.db
        .prepare(
          `SELECT COUNT(DISTINCT session_hash) AS dau FROM analytics_beacons
           WHERE app_slug = ? AND period = ?`,
        )
        .get(appSlug, period) as { dau?: number } | null;
      return row?.dau ?? 0;
    } catch {
      return 0;
    }
  }

  joinRoom(roomId: string, peer: PeerSocket): void {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { peers: new Map(), lastActivityMs: Date.now() };
      this.rooms.set(roomId, room);
    }
    room.peers.set(peer.peerId, peer);
    room.lastActivityMs = Date.now();
    this.touchAudit(roomId);

    // Tell the new peer who's already here.
    for (const [otherId] of room.peers) {
      if (otherId === peer.peerId) continue;
      peer.send(JSON.stringify({ t: 'peer-joined', peerId: otherId }));
    }
    // Tell the existing peers about the new one.
    this.broadcast(roomId, { t: 'peer-joined', peerId: peer.peerId }, peer.peerId);
  }

  leaveRoom(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.peers.delete(peerId);
    room.lastActivityMs = Date.now();
    this.touchAudit(roomId);
    this.broadcast(roomId, { t: 'peer-left', peerId }, peerId);
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /**
   * Forwards a signalling message from one peer to another (`to` set)
   * or fans out to the room (`to` unset).
   */
  forward(
    roomId: string,
    from: string,
    msg: { t: string; to?: string; from?: string },
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.lastActivityMs = Date.now();
    this.touchAudit(roomId);
    const wire = JSON.stringify({ ...msg, from });
    if (msg.to) {
      const target = room.peers.get(msg.to);
      if (target) target.send(wire);
    } else {
      this.broadcast(roomId, msg, from);
    }
  }

  stats(): RoomStats[] {
    return [...this.rooms.entries()].map(([id, r]) => ({
      roomId: id,
      peerCount: r.peers.size,
      lastActivityMs: r.lastActivityMs,
    }));
  }

  /** Test helper: blow away all state. */
  reset(): void {
    for (const room of this.rooms.values()) {
      for (const p of room.peers.values()) p.close();
    }
    this.rooms.clear();
  }

  private broadcast(roomId: string, msg: object, except: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const wire = JSON.stringify(msg);
    for (const [pid, p] of room.peers) {
      if (pid === except) continue;
      try {
        p.send(wire);
      } catch {
        // Best-effort; don't let one dead socket drop the whole room.
      }
    }
  }

  private touchAudit(roomId: string): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          'INSERT INTO room_audit (room_id, last_active) VALUES (?, ?) ON CONFLICT(room_id) DO UPDATE SET last_active = excluded.last_active',
        )
        .run(roomId, Date.now());
    } catch {
      // SQLite errors are non-fatal — audit is informational only.
    }
  }
}
