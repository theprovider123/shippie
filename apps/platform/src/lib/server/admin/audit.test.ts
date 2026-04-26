/**
 * Tests for `recordAudit`. Driven by a stubbed Drizzle `db` that
 * captures the insert-values payload and the chained `.returning()`
 * call. We're not testing SQL — the schema-level guarantees come from
 * the dual-write integration tests — only the helper's input → row
 * mapping and its idempotency contract on retry.
 */
import { describe, expect, it } from 'vitest';
import { recordAudit } from './audit';

interface InsertedRow {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipHash: string | null;
  createdAt: string;
}

interface FakeDb {
  inserted: InsertedRow[];
  returnRows: InsertedRow[] | null;
  insert: (table: unknown) => {
    values: (v: Record<string, unknown>) => {
      returning: () => Promise<InsertedRow[]>;
    };
  };
}

function makeDb(opts: { returnRows?: InsertedRow[] | null } = {}): FakeDb {
  const inserted: InsertedRow[] = [];
  return {
    inserted,
    returnRows: opts.returnRows ?? null,
    insert(_table) {
      return {
        values: (v) => ({
          returning: async () => {
            const row: InsertedRow = {
              id: (v.id as string) ?? `row-${inserted.length + 1}`,
              actorUserId: (v.actorUserId as string | null) ?? null,
              action: v.action as string,
              targetType: (v.targetType as string | null) ?? null,
              targetId: (v.targetId as string | null) ?? null,
              metadata: (v.metadata as Record<string, unknown> | null) ?? null,
              ipHash: (v.ipHash as string | null) ?? null,
              createdAt: '2026-04-24T00:00:00Z',
            };
            inserted.push(row);
            return opts.returnRows ?? [row];
          },
        }),
      };
    },
  };
}

describe('recordAudit', () => {
  it('writes a row with action + target + actor', async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await recordAudit(db as any, {
      actorUserId: 'user-1',
      action: 'admin.app.archive',
      targetTable: 'apps',
      targetId: 'app-42',
      before: { isArchived: false },
      after: { isArchived: true },
    });

    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].actorUserId).toBe('user-1');
    expect(db.inserted[0].action).toBe('admin.app.archive');
    expect(db.inserted[0].targetType).toBe('apps');
    expect(db.inserted[0].targetId).toBe('app-42');
    expect(db.inserted[0].metadata).toEqual({
      before: { isArchived: false },
      after: { isArchived: true },
    });
    expect(row.action).toBe('admin.app.archive');
  });

  it('omits before/after from metadata when both are absent', async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, {
      actorUserId: 'user-1',
      action: 'admin.system.heartbeat',
      targetTable: 'system',
      targetId: null,
    });
    expect(db.inserted[0].metadata).toBeNull();
  });

  it('records before-only on a delete-style audit', async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, {
      actorUserId: 'user-1',
      action: 'admin.app.delete',
      targetTable: 'apps',
      targetId: 'app-42',
      before: { name: 'Goodbye' },
    });
    expect(db.inserted[0].metadata).toEqual({ before: { name: 'Goodbye' } });
  });

  it('records after-only on a create-style audit', async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, {
      actorUserId: 'user-1',
      action: 'admin.app.create',
      targetTable: 'apps',
      targetId: 'app-42',
      after: { name: 'Hello' },
    });
    expect(db.inserted[0].metadata).toEqual({ after: { name: 'Hello' } });
  });

  it('passes ipHash through when supplied', async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, {
      actorUserId: 'user-1',
      action: 'admin.app.archive',
      targetTable: 'apps',
      targetId: 'app-42',
      ipHash: 'abc123',
    });
    expect(db.inserted[0].ipHash).toBe('abc123');
  });

  it('throws if returning() yields no row (defensive)', async () => {
    const db = makeDb({ returnRows: [] });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recordAudit(db as any, {
        actorUserId: 'user-1',
        action: 'admin.app.archive',
        targetTable: 'apps',
        targetId: 'app-42',
      }),
    ).rejects.toThrow('audit_log insert returned no row');
  });

  it('idempotency: each call appends a fresh row (caller-driven retry)', async () => {
    // The helper has no de-dup logic by design — audit_log is append-only,
    // and the actor's request id is the de-dup key on the caller side.
    // Pin that contract: two identical calls produce two distinct rows.
    const db = makeDb();
    const input = {
      actorUserId: 'user-1',
      action: 'admin.app.archive',
      targetTable: 'apps',
      targetId: 'app-42',
      before: { isArchived: false },
      after: { isArchived: true },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, input);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordAudit(db as any, input);
    expect(db.inserted).toHaveLength(2);
  });
});
