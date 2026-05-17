import { describe, expect, test } from 'vitest';
import {
  claimTrialAppForMaker,
  createTrialClaimReceipt,
  verifyTrialClaimReceipt,
} from './trial-claim';

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

  test('requires a valid receipt when a receipt secret is supplied', async () => {
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
      receiptSecret: 'secret',
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    expect(result).toEqual({ claimed: false, reason: 'missing_receipt' });
    expect(updates).toEqual([]);
  });

  test('accepts a signed claim receipt for the matching app', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    const receipt = await createTrialClaimReceipt(
      {
        slug: 'trial-abcd1234',
        appId: 'app-1',
        deployId: 'deploy-1',
        zipSha256: 'abc123',
        expiresAt: '2026-05-06T12:00:00.000Z',
        now,
      },
      'secret',
    );
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
      receipt,
      receiptSecret: 'secret',
      now,
    });

    expect(result).toEqual({ claimed: true, slug: 'trial-abcd1234' });
    expect(updates[0]).toMatchObject({ makerId: 'maker-1' });
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

describe('trial claim receipts', () => {
  test('round-trips and rejects slug mismatch', async () => {
    const receipt = await createTrialClaimReceipt(
      {
        slug: 'trial-abcd1234',
        appId: 'app-1',
        deployId: 'deploy-1',
        zipSha256: 'abc123',
        expiresAt: '2026-05-06T12:00:00.000Z',
        now: new Date('2026-05-05T12:00:00.000Z'),
      },
      'secret',
    );

    const ok = await verifyTrialClaimReceipt(receipt, 'secret', {
      slug: 'trial-abcd1234',
      appId: 'app-1',
      now: new Date('2026-05-05T12:00:01.000Z'),
    });
    expect(ok?.deploy_id).toBe('deploy-1');

    const mismatch = await verifyTrialClaimReceipt(receipt, 'secret', {
      slug: 'trial-other',
      appId: 'app-1',
      now: new Date('2026-05-05T12:00:01.000Z'),
    });
    expect(mismatch).toBeNull();
  });
});
