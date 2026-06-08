import { describe, expect, it } from 'vitest';
import { getLatestFeed, publishFeed } from './store';

/** Minimal in-memory D1 fake — supports exactly the statements store.ts issues. */
class FakeStmt {
  private args: unknown[] = [];
  constructor(private rows: Map<string, Record<string, unknown>>, private sql: string) {}
  bind(...a: unknown[]) { this.args = a; return this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async first<T>(): Promise<T | null> {
    if (this.sql.includes('SELECT * FROM app_feeds WHERE app_slug')) {
      const [appSlug, feedId] = this.args;
      for (const r of this.rows.values()) if (r.app_slug === appSlug && r.feed_id === feedId) return r as T;
      return null;
    }
    if (this.sql.includes('SELECT sequence, hash')) {
      const r = this.rows.get(String(this.args[0]));
      return r ? ({ sequence: r.sequence, hash: r.hash } as T) : null;
    }
    return null;
  }
  async run() {
    const keys = ['id', 'app_slug', 'feed_id', 'data_schema', 'sequence', 'updated_at', 'stale_after', 'hash', 'source_kind', 'source_name', 'payload', 'created_at'];
    const row: Record<string, unknown> = {};
    keys.forEach((k, i) => (row[k] = this.args[i]));
    this.rows.set(String(row.id), row);
    return { success: true };
  }
}
class FakeD1 {
  rows = new Map<string, Record<string, unknown>>();
  prepare(sql: string) { return new FakeStmt(this.rows, sql); }
}
const db = () => new FakeD1() as unknown as Parameters<typeof publishFeed>[0];

const base = {
  appSlug: 'golazo', feedId: 'scores', dataSchema: 'golazo.scores.v1',
  updatedAt: '2026-06-08T09:00:00Z', nowMs: 1780900000000,
};

describe('publishFeed + getLatestFeed', () => {
  it('first publish stores sequence 1 and round-trips the payload', async () => {
    const d = db();
    const res = await publishFeed(d, { ...base, payload: { live: [{ matchId: 'm1' }] } });
    expect(res.changed).toBe(true);
    expect(res.envelope.sequence).toBe(1);

    const latest = await getLatestFeed(d, 'golazo', 'scores');
    expect(latest?.payload).toEqual({ live: [{ matchId: 'm1' }] });
    expect(latest?.schema).toBe('shippie.feed.v1');
  });

  it('an identical payload does not bump the sequence', async () => {
    const d = db();
    await publishFeed(d, { ...base, payload: { live: [] } });
    const second = await publishFeed(d, { ...base, payload: { live: [] } });
    expect(second.changed).toBe(false);
    expect(second.envelope.sequence).toBe(1);
  });

  it('a changed payload bumps the sequence', async () => {
    const d = db();
    await publishFeed(d, { ...base, payload: { live: [] } });
    const second = await publishFeed(d, { ...base, payload: { live: [{ matchId: 'm9' }] } });
    expect(second.changed).toBe(true);
    expect(second.envelope.sequence).toBe(2);
  });

  it('returns null when no feed exists', async () => {
    expect(await getLatestFeed(db(), 'nope', 'missing')).toBeNull();
  });
});
