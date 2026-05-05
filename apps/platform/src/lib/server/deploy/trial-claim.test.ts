import { describe, expect, test } from 'vitest';
import { claimTrialAppForMaker } from './trial-claim';

type TrialRow = {
  id: string;
  slug: string;
  isTrial: boolean;
  trialUntil: string | null;
  trialClaimedBy: string | null;
};

function makeDb(row: TrialRow | null) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    select() {
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        limit() {
          return Promise.resolve(row ? [row] : []);
        },
      };
      return chain;
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          updates.push(values);
          return {
            where() {
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, updates };
}

describe('claimTrialAppForMaker', () => {
  test('transfers a live unclaimed trial to the maker', async () => {
    const { db, updates } = makeDb({
      id: 'app-1',
      slug: 'trial-abcd1234',
      isTrial: true,
      trialUntil: '2026-05-06T12:00:00.000Z',
      trialClaimedBy: null,
    });

    const result = await claimTrialAppForMaker({
      db: db as never,
      slug: 'trial-abcd1234',
      makerId: 'maker-1',
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(result).toEqual({ claimed: true, slug: 'trial-abcd1234' });
    expect(updates).toEqual([
      {
        makerId: 'maker-1',
        isTrial: false,
        trialClaimedBy: 'maker-1',
        trialIpHash: null,
        updatedAt: '2026-05-05T12:00:00.000Z',
      },
    ]);
  });

  test('refuses expired trials', async () => {
    const { db, updates } = makeDb({
      id: 'app-1',
      slug: 'trial-expired',
      isTrial: true,
      trialUntil: '2026-05-05T11:59:59.000Z',
      trialClaimedBy: null,
    });

    const result = await claimTrialAppForMaker({
      db: db as never,
      slug: 'trial-expired',
      makerId: 'maker-1',
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(result).toEqual({ claimed: false, reason: 'expired' });
    expect(updates).toEqual([]);
  });
});
