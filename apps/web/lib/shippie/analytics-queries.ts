// apps/web/lib/shippie/analytics-queries.ts
/**
 * Pure query helpers for the maker analytics dashboard.
 *
 * All functions take the Shippie Drizzle handle and a query spec, returning
 * plain data. Tested directly against PGlite so the dashboard page
 * can render deterministically.
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

function dayWindow(days: number, endDate?: Date): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  // Snap end to UTC midnight tomorrow so the bucket for "today" is included.
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days - 1);
  return { start, end };
}

export interface UsageDailyRow {
  day: Date;
  count: number;
}

export async function queryUsageDaily(
  db: ShippieDb,
  spec: { appId: string; eventType: string; days: number; endDate?: Date },
): Promise<UsageDailyRow[]> {
  const { start, end } = dayWindow(spec.days, spec.endDate);
  const rows = await db
    .select({ day: schema.usageDaily.day, count: schema.usageDaily.count })
    .from(schema.usageDaily)
    .where(
      and(
        eq(schema.usageDaily.appId, spec.appId),
        eq(schema.usageDaily.eventType, spec.eventType),
        gte(schema.usageDaily.day, start),
        lte(schema.usageDaily.day, end),
      ),
    );
  return rows
    .map((r) => ({ day: r.day as Date, count: Number(r.count) }))
    .sort((a, b) => a.day.getTime() - b.day.getTime());
}

async function sumByType(
  db: ShippieDb,
  spec: { appId: string; eventType: string; days: number; endDate?: Date },
): Promise<number> {
  const rows = await queryUsageDaily(db, spec);
  return rows.reduce((acc, r) => acc + r.count, 0);
}

export interface InstallFunnel {
  shown: number;
  accepted: number;
  dismissed: number;
  conversion: number;
}

export async function queryInstallFunnel(
  db: ShippieDb,
  spec: { appId: string; days: number; endDate?: Date },
): Promise<InstallFunnel> {
  const [shown, accepted, dismissed] = await Promise.all([
    sumByType(db, { ...spec, eventType: 'install_prompt_shown' }),
    sumByType(db, { ...spec, eventType: 'install_prompt_accepted' }),
    sumByType(db, { ...spec, eventType: 'install_prompt_dismissed' }),
  ]);
  return {
    shown,
    accepted,
    dismissed,
    conversion: shown === 0 ? 0 : accepted / shown,
  };
}

export interface IabBounce {
  detected: number;
  bounced: number;
  rate: number;
}

export async function queryIabBounce(
  db: ShippieDb,
  spec: { appId: string; days: number; endDate?: Date },
): Promise<IabBounce> {
  const [detected, bounced] = await Promise.all([
    sumByType(db, { ...spec, eventType: 'iab_detected' }),
    sumByType(db, { ...spec, eventType: 'iab_bounced' }),
  ]);
  return {
    detected,
    bounced,
    rate: detected === 0 ? 0 : bounced / detected,
  };
}
