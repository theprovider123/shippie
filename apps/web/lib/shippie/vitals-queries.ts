// apps/web/lib/shippie/vitals-queries.ts
/**
 * Web-vitals percentile queries for the maker analytics dashboard.
 *
 * Pulls `event_type='web_vital'` rows from `app_events`, buckets by
 * metadata->>'name', computes p50/p75/p95 in memory. Simple and cheap
 * for Phase 4 — volume-aware aggregation lands in Phase 5.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';

export interface VitalSummary {
  name: 'LCP' | 'CLS' | 'INP';
  p50: number;
  p75: number;
  p95: number;
  samples: number;
}

const ORDER: VitalSummary['name'][] = ['LCP', 'CLS', 'INP'];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function dayWindow(days: number, endDate?: Date): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  // Snap end to UTC midnight tomorrow so the bucket for "today" is included.
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days - 1);
  return { start, end };
}

export async function queryWebVitals(
  db: ShippieDb,
  spec: { appId: string; days: number; endDate?: Date },
): Promise<VitalSummary[]> {
  const { start, end } = dayWindow(spec.days, spec.endDate);

  const rows = await db
    .select({
      name: sql<string>`${schema.appEvents.metadata}->>'name'`,
      value: sql<number>`CAST(${schema.appEvents.metadata}->>'value' AS double precision)`,
    })
    .from(schema.appEvents)
    .where(
      and(
        eq(schema.appEvents.appId, spec.appId),
        eq(schema.appEvents.eventType, 'web_vital'),
        gte(schema.appEvents.ts, start),
        lte(schema.appEvents.ts, end),
      ),
    );

  const buckets: Record<VitalSummary['name'], number[]> = {
    LCP: [],
    CLS: [],
    INP: [],
  };
  for (const r of rows) {
    const name = r.name;
    if (name === 'LCP' || name === 'CLS' || name === 'INP') {
      const num = typeof r.value === 'number' ? r.value : Number(r.value);
      if (!Number.isNaN(num)) {
        buckets[name].push(num);
      }
    }
  }

  const out: VitalSummary[] = [];
  for (const name of ORDER) {
    const values = buckets[name].slice().sort((a, b) => a - b);
    if (values.length === 0) continue;
    out.push({
      name,
      p50: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      p95: percentile(values, 0.95),
      samples: values.length,
    });
  }
  return out;
}
