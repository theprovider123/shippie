/**
 * Tests for the synthetic anonymous-trial-maker plumbing.
 *
 * Two invariants matter:
 *  1. The TS-side TRIAL_MAKER_ID matches the id used in the SQL
 *     migration. If these drift, every trial deploy 500s with a FK
 *     violation on `apps.maker_id`.
 *  2. ensureTrialMakerSeeded uses INSERT OR IGNORE so it's safe to call
 *     on every request without churning the row.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  TRIAL_MAKER_ID,
  TRIAL_MAKER_EMAIL,
  TRIAL_MAKER_USERNAME,
  ensureTrialMakerSeeded,
} from './trial-maker';

type FakeRunCall = {
  sql: string;
  bound: unknown[];
};

function makeFakeD1() {
  const calls: FakeRunCall[] = [];
  const run = vi.fn(async () => ({ success: true, meta: {} }));
  const bind = vi.fn((...args: unknown[]) => {
    const last = calls[calls.length - 1];
    if (last) last.bound = args;
    return { run };
  });
  const prepare = vi.fn((sql: string) => {
    calls.push({ sql, bound: [] });
    return { bind };
  });
  return {
    d1: { prepare } as unknown as Parameters<typeof ensureTrialMakerSeeded>[0],
    calls,
    run,
  };
}

describe('TRIAL_MAKER_ID', () => {
  it('matches the id used in the seed migration', () => {
    const sqlPath = resolve(
      __dirname,
      '../../../../drizzle/0005_trial_maker_seed.sql',
    );
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toContain(TRIAL_MAKER_ID);
    expect(sql).toContain(TRIAL_MAKER_EMAIL);
    expect(sql).toContain(TRIAL_MAKER_USERNAME);
  });

  it('is a stable, frozen constant so the migration stays in sync', () => {
    // The id is intentionally NOT a strict v4 UUID — its suffix spells
    // "trialmakerid01" so anyone grepping `apps.maker_id` rows
    // immediately sees what they're looking at. apps.id is a plain TEXT
    // column in the SQLite/D1 schema, so it accepts any string. What
    // matters is that this literal never drifts away from what
    // 0005_trial_maker_seed.sql inserts.
    expect(TRIAL_MAKER_ID).toBe('00000000-0000-4000-8000-trialmakerid01');
  });
});

describe('ensureTrialMakerSeeded', () => {
  it('issues a single INSERT OR IGNORE bound to the synthetic identity', async () => {
    const { d1, calls, run } = makeFakeD1();

    await ensureTrialMakerSeeded(d1);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.sql).toMatch(/insert\s+or\s+ignore\s+into\s+users/i);
    // The id, email, username, display name must all be bound — order is
    // load-bearing because the SQL is positional.
    expect(call.bound).toEqual([
      TRIAL_MAKER_ID,
      TRIAL_MAKER_EMAIL,
      TRIAL_MAKER_USERNAME,
      'Anonymous Trial',
    ]);
    expect(run).toHaveBeenCalledOnce();
  });

  it('is safe to call repeatedly (no client-side dedup needed)', async () => {
    const { d1, run } = makeFakeD1();

    await ensureTrialMakerSeeded(d1);
    await ensureTrialMakerSeeded(d1);
    await ensureTrialMakerSeeded(d1);

    // We delegate idempotency to the DB via INSERT OR IGNORE. The
    // function itself just blasts the statement each time, which is
    // fine — D1 turns repeats into a single-row UNIQUE no-op.
    expect(run).toHaveBeenCalledTimes(3);
  });
});
